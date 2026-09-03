/**
 * Switches on the demo banner, and nothing else.
 *
 * The free public demo (Cloud Run + Neon) sits on servers outside Ethiopia,
 * so it is lawful under Proclamation 1321/2024 Art 22(1) only while it holds
 * fictional data. `DemoBanner` is what says so on every page; this is the one
 * place that decides whether it renders.
 *
 * `NEXT_PUBLIC_*` is compiled into the bundle at BUILD time, exactly like
 * `NEXT_PUBLIC_API_URL` — the demo image must be built with
 * `--build-arg NEXT_PUBLIC_DEMO_MODE=1`. Setting it only on the running
 * container does nothing.
 *
 * Strictly `'1'`: unset, `'0'`, `''` and even `'false'` are all off, so the
 * on-prem production build — which sets nothing — cannot opt in by accident,
 * and a truthiness check can never turn the string `'false'` into a banner.
 */
export const isDemoMode = (value: string | undefined): boolean => value === '1';
