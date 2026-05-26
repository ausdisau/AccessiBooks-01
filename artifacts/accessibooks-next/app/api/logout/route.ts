/**
 * /api/logout — legacy GET-logout alias.
 *
 * AppHeader navigates the browser to `/api/logout` (window.location.href), so
 * preserve that path. Delegates to the same handler as /api/auth/logout.
 */
export { GET } from "../auth/logout/route";
