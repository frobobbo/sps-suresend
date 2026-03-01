import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  domain!: string;

  @IsIn(['starter', 'growth', 'pro'])
  tier!: 'starter' | 'growth' | 'pro';
}
