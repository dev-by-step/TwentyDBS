import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

@InputType()
export class CompleteSuperadminWorkspaceSetupEntityInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;

  @Field(() => String)
  @IsString()
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  website?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @Field(() => Boolean)
  @IsBoolean()
  isMember: boolean;
}

@InputType()
export class CompleteSuperadminWorkspaceSetupInput {
  @Field(() => [CompleteSuperadminWorkspaceSetupEntityInput])
  @ValidateNested({ each: true })
  @Type(() => CompleteSuperadminWorkspaceSetupEntityInput)
  entities: CompleteSuperadminWorkspaceSetupEntityInput[];

  @Field(() => [String])
  @IsString({ each: true })
  selectedObjectMetadataIds: string[];
}
