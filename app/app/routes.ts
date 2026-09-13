import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/refresh", "routes/api.refresh.ts"),
] satisfies RouteConfig;
