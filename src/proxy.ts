import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 重命名了 middleware → proxy。文件位于 src/proxy.ts。
 *
 * 唯一职责：在每次导航时刷新 Supabase 会话 cookie。Supabase access token 寿命短，
 * 没有这个钩子就只能等 RSC/Route Handler 触发刷新，但 Server Component 里又写不进 cookie
 * （src/lib/supabase/server.ts 的 setAll catch 注释提到这点），结果就是 token 过期后用户掉登录。
 *
 * 实现要点（@supabase/ssr 官方推荐模式）：
 *   1. 用 request 的 cookie 创建服务端 client；
 *   2. 调一次 supabase.auth.getUser() 触发刷新；
 *   3. 把刷新后的 cookie 同步到 response 上（既写 request 也写 response，
 *      这样后续 RSC 读到的就是新值）。
 *
 * 注意：除了刷新会话之外什么都不做（不做鉴权重定向、不读业务数据），
 * 让 Server Component / Route Handler 各自做权限决策。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // 同步到 request（让本次 RSC 也读得到新 cookie）
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // 重新构造 response，把刷新后的 cookie 写回浏览器
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 关键：getUser 会校验 token 并在到期时触发 refresh，refresh 后的 cookie
  // 通过上面的 setAll 写回 response。注意不要在 proxy 与 getUser 之间加任何
  // 逻辑，避免引入「读到旧 user 然后又被 refresh 覆盖」的窗口。
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 跳过静态资源 / 图片优化 / favicon —— 这些请求不需要走会话刷新，
  // 每次都跑 supabase 客户端会白白增加冷启动开销和请求数。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
