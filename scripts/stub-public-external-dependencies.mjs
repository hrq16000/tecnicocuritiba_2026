/**
 * Isola somente as dependências externas já identificadas nos traces E2E.
 * Não suprime erros de console nem altera conteúdo de negócio.
 */
export async function stubPublicExternalDependencies(page) {
  await page.route("https://ipapi.co/json/", (route) => route.fulfill({
    status: 200,
    headers: { "access-control-allow-origin": "*" },
    json: { city: null, country_code: "BR" },
  }));
  await page.route(/^http:\/\/127\.0\.0\.1:54321\/functions\/v1\/aggregate-rating(?:\?|$)/, (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, x-supabase-api-version",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: { enabled: false, reviewCount: 0 } });
  });
}
