// The "Enterprise" nav entry historically pointed at a separate page that
// called a non-existent /api/enterprise/* surface. Institutional / B2B
// licensing (Task #216) consolidates everything into the institutional page,
// which is backed by the real /api/institutional/* endpoints. Re-export it so
// /enterprise and /institutional render the exact same experience.
export { default } from "./institutional";
