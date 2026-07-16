import { ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { ConfigVariableType } from 'src/engine/core-modules/twenty-config/enums/config-variable-type.enum';
import { ConfigVariablesGroup } from 'src/engine/core-modules/twenty-config/enums/config-variables-group.enum';
import { TypedReflect } from 'src/utils/typed-reflect';

describe('multi-entity config variables', () => {
  const metadata = TypedReflect.getMetadata(
    'config-variables',
    ConfigVariables,
  );

  it('declares bootstrap admin emails as an environment-only config variable', () => {
    expect(metadata?.BOOTSTRAP_ADMIN_EMAILS).toMatchObject({
      group: ConfigVariablesGroup.ADVANCED_SETTINGS,
      isEnvOnly: true,
      type: ConfigVariableType.STRING,
    });
  });

  it('declares internal entity seeds as an environment-only config variable', () => {
    expect(metadata?.INTERNAL_ENTITY_SEEDS).toMatchObject({
      group: ConfigVariablesGroup.ADVANCED_SETTINGS,
      isEnvOnly: true,
      type: ConfigVariableType.STRING,
    });
  });
});
