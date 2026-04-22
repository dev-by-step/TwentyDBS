import Exa from 'exa-js';
import { defineLogicFunction } from 'twenty-sdk/define';

import {
  DEFAULT_NUM_RESULTS,
  exaWebSearchInputSchema,
  type ExaWebSearchInput,
} from './exa-web-search.schema';

const MAX_HIGHLIGHT_CHARACTERS = 4000;

// Exa auto-search pricing (2025): $0.007 covers the first 10 results,
// additional results cost $0.001 each. Twenty's billing contract expresses
// cost in micro-credits where 1 micro-credit = $0.000001
// (DOLLAR_TO_CREDIT_MULTIPLIER = 1_000_000 server-side).
const MICRO_CREDITS_PER_DOLLAR = 1_000_000;
const EXA_BASE_COST_DOLLARS = 0.007;
const EXA_COST_PER_ADDITIONAL_RESULT_DOLLARS = 0.001;

type ExaSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type HandlerResult = {
  success: boolean;
  message: string;
  result?: ExaSearchResult[];
  error?: string;
};

const computeMicroCredits = (numResults: number): number => {
  const additional = Math.max(0, numResults - DEFAULT_NUM_RESULTS);
  const dollars =
    EXA_BASE_COST_DOLLARS + additional * EXA_COST_PER_ADDITIONAL_RESULT_DOLLARS;

  return Math.round(dollars * MICRO_CREDITS_PER_DOLLAR);
};

const chargeCredits = async (
  numResults: number,
  env: Record<string, string | undefined>,
): Promise<void> => {
  const apiUrl = env.TWENTY_API_URL;
  const token = env.TWENTY_APP_ACCESS_TOKEN;

  if (!apiUrl || !token) {
    return;
  }

  try {
    await fetch(`${apiUrl.replace(/\/$/, '')}/app/billing/charge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creditsUsedMicro: computeMicroCredits(numResults),
        quantity: 1,
        unit: 'INVOCATION',
        operationType: 'WEB_SEARCH',
        resourceContext: 'exa',
      }),
    });
  } catch (error) {
    // Non-fatal — log and continue. The tool result is already computed;
    // losing a billing event is preferable to surfacing a billing failure
    // as a tool failure.
    console.error(
      `exa_web_search: failed to record billing: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const handler = async (
  parameters: ExaWebSearchInput,
): Promise<HandlerResult> => {
  const env = process.env;
  const apiKey = env.EXA_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      message: 'Exa is not configured',
      error:
        'EXA_API_KEY is not set. The server admin must provide an Exa API key for this tool to work.',
    };
  }

  const query = parameters.query;
  const numResults = parameters.numResults ?? DEFAULT_NUM_RESULTS;
  const category = parameters.category;

  try {
    const exa = new Exa(apiKey);

    const response = await exa.search(query, {
      type: 'auto',
      numResults,
      category,
      contents: {
        highlights: { maxCharacters: MAX_HIGHLIGHT_CHARACTERS },
      },
    });

    const results: ExaSearchResult[] = response.results.map((result) => ({
      title: result.title ?? '',
      url: result.url,
      snippet: result.highlights?.join('\n') ?? '',
    }));

    await chargeCredits(results.length, env);

    return {
      success: true,
      message: `Found ${results.length} results for "${query}"${category ? ` (category: ${category})` : ''}`,
      result: results,
    };
  } catch (error) {
    return {
      success: false,
      message: `Web search failed for "${query}"`,
      error: error instanceof Error ? error.message : 'Web search failed',
    };
  }
};

export default defineLogicFunction({
  universalIdentifier: '4c6f9b2a-5d8e-4c2a-af18-3e0b9c6a7e4f',
  name: 'exa_web_search',
  description:
    'Structured web search powered by Exa. Returns entity-aware results with category filtering (companies, people, research papers, news, and other content types). Prefer this when the query benefits from structured data or a specific category. For general real-time web browsing, prefer the native `web_search` tool when it is available.',
  timeoutSeconds: 30,
  isTool: true,
  toolInputSchema: exaWebSearchInputSchema,
  handler,
});
