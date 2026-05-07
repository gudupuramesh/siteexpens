// Local typings for `@msg91comm/sendotp-react-native`.
//
// The published SDK ships its TypeScript source as `main` (`index.ts`)
// without proper d.ts files; that source has implicit-any params that
// trip `strict` mode in the consumer. Wiring `paths` in the workspace
// `tsconfig.json` to this file gives us strongly-typed imports without
// editing third-party code.
//
// Runtime resolution is unaffected — Metro / Node still picks up the
// real package because path mapping only influences the TypeScript
// compiler.
declare module '@msg91comm/sendotp-react-native' {
  export interface SendOTPRequest {
    identifier: string;
  }
  export interface VerifyOTPRequest {
    reqId: string;
    otp: string;
  }
  export interface RetryOTPRequest {
    reqId: string;
    retryChannel?: number;
  }

  export interface OTPResponse {
    type?: 'success' | 'error';
    message?: string;
    'access-token'?: string;
    invisibleVerified?: boolean;
    code?: number;
  }

  export class OTPWidget {
    static initializeWidget(widgetId: string, tokenAuth: string): Promise<void>;
    static sendOTP(body: SendOTPRequest): Promise<OTPResponse | undefined>;
    static verifyOTP(body: VerifyOTPRequest): Promise<OTPResponse | undefined>;
    static retryOTP(body: RetryOTPRequest): Promise<OTPResponse | undefined>;
    static getWidgetProcess(): Promise<unknown>;
  }
}
