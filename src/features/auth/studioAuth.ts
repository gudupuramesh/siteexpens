/**
 * Auth visual + MSG91 defaults kept in sync with the Studio web app:
 * - Gradient / blues: `studio/src/app/globals.css` (`:root` primary / accent / background)
 * - Widget id + tokenAuth for **web** Studio: env / `OTPLoginForm` — do not commit secrets here.
 *
 * React Native reads MSG91 from `EXPO_PUBLIC_MSG91_WIDGET_ID` and `EXPO_PUBLIC_MSG91_TOKEN_AUTH`
 * (EAS env / `.env`). The fields below stay **empty** so production builds never ship widget tokens
 * from source control; local dev sets `.env` like `.env.example`.
 *
 * MSG91 requires **Mobile Integration** on the widget used by the native SDK.
 */
export const studioAuth = {
  /** `bg-gradient-to-br from-primary via-accent to-background` */
  gradient: ['#4F7CFF', '#7B9BFF', '#F5F5F5'] as const,
  primary: '#4F7CFF',
  accent: '#7B9BFF',
  canvas: '#F5F5F5',
  card: '#FFFFFF',
  msg91WidgetId: '',
  msg91TokenAuth: '',
} as const;

/** Studio “shadow-button” — blue-tinted elevation on primary CTA */
export const studioPrimaryButtonShadow = {
  shadowColor: '#4F7CFF',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 12,
  elevation: 6,
} as const;
