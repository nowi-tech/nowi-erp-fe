// Hand-written minimal types. Will be regenerated from BE OpenAPI via `pnpm gen:api`.

export type UserRole =
  | 'admin'
  | 'stitching_master'
  | 'finishing_master'
  | 'data_manager'
  | 'viewer';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  isTrainingMode: boolean;
}

export interface VerifyOtpResponse {
  token: string;
  user: User;
}
