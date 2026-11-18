import type { ApiProvider, HeaderParam } from '../types/benchmark';
import {
  buildModelsListRequestPlan,
  parseModelsListResponse,
  type DiscoveredModel,
} from '../utils/modelDiscovery';

export type FetchModelsResult =
  | {
      ok: true;
      models: DiscoveredModel[];
      resolvedUrl: string;
      usedFallbackV1: boolean;
      viaProxy: boolean;
    }
  | {
      ok: false;
      error: string;
      isCorsOrNetworkError: boolean;
      attemptedUrls: string[];
    };

export async function fetchProviderModels(
  provider: ApiProvider,
  globalHeaders: HeaderParam[],
  options?: {
    useProxy?: boolean;
    signal?: AbortSignal;
  }
): Promise<FetchModelsResult> {
  const plan = buildModelsListRequestPlan(provider, globalHeaders);
  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error,
      isCorsOrNetworkError: false,
      attemptedUrls: [],
    };
  }

  const useProxy = Boolean(options?.useProxy);
  const signal = options?.signal;

  if (useProxy) {
    try {
      const res = await fetch('/api/proxy/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: plan.urls,
          headers: plan.headers,
        }),
        signal,
      });

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        status?: number;
        statusText?: string;
        url?: string;
        payload?: unknown;
        error?: string;
      } | null;

      if (!res.ok || !body || !body.ok) {
        return {
          ok: false,
          error:
            body?.error ||
            `本地代理拉取失败 (HTTP ${body?.status ?? res.status})`,
          isCorsOrNetworkError: false,
          attemptedUrls: plan.urls,
        };
      }

      const parsed = parseModelsListResponse(body.payload, provider.format);
      const resolvedUrl = body.url || plan.urls[0];
      return {
        ok: true,
        models: parsed,
        resolvedUrl,
        usedFallbackV1:
          plan.urls.length > 1 && resolvedUrl === plan.urls[1],
        viaProxy: true,
      };
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      return {
        ok: false,
        error: isAbort
          ? '已取消拉取模型列表'
          : err instanceof Error
            ? err.message
            : '本地代理请求异常',
        isCorsOrNetworkError: false,
        attemptedUrls: plan.urls,
      };
    }
  }

  // Direct browser fetch (tries primary URL, then /v1/models fallback on 404 if applicable)
  const minimalPlan = buildModelsListRequestPlan(provider, globalHeaders, {
    includeProviderHeaders: false,
    includeGlobalHeaders: false,
  });

  const attemptDirect = async (
    urls: string[],
    headers: Record<string, string>
  ): Promise<
    | { ok: true; models: ReturnType<typeof parseModelsListResponse>; resolvedUrl: string; usedFallbackV1: boolean }
    | { ok: false; error: string; isCorsOrNetworkError: boolean; aborted?: boolean }
  > => {
    let errMsg = '';
    let corsErr = false;

    for (let i = 0; i < urls.length; i += 1) {
      const targetUrl = urls[i];
      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers,
          signal,
        });

        if (!response.ok) {
          if (response.status === 404 && i < urls.length - 1) {
            continue;
          }
          const errText = await response.text().catch(() => '');
          const snippet = errText.slice(0, 220).trim();
          errMsg = `HTTP ${response.status} ${response.statusText}${snippet ? ` — ${snippet}` : ''}`;
          corsErr = false;
          break;
        }

        const payload = (await response.json()) as unknown;
        const models = parseModelsListResponse(payload, provider.format);
        return {
          ok: true,
          models,
          resolvedUrl: targetUrl,
          usedFallbackV1: i > 0,
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return {
            ok: false,
            error: '已取消拉取模型列表',
            isCorsOrNetworkError: false,
            aborted: true,
          };
        }
        corsErr = true;
        errMsg =
          '浏览器直连被目标网关 CORS 策略拦截或网络不可达（如 NVIDIA NIM 等部分网关未开放浏览器跨域头）。';
        break;
      }
    }

    return {
      ok: false,
      error: errMsg || '未能获取到可用模型列表',
      isCorsOrNetworkError: corsErr,
    };
  };

  const firstAttempt = await attemptDirect(plan.urls, plan.headers);
  if (firstAttempt.ok) {
    return {
      ok: true,
      models: firstAttempt.models,
      resolvedUrl: firstAttempt.resolvedUrl,
      usedFallbackV1: firstAttempt.usedFallbackV1,
      viaProxy: false,
    };
  }
  if (firstAttempt.aborted) {
    return {
      ok: false,
      error: firstAttempt.error,
      isCorsOrNetworkError: false,
      attemptedUrls: plan.urls,
    };
  }

  // If custom headers triggered a CORS preflight failure, retry once with auth-only headers
  if (
    firstAttempt.isCorsOrNetworkError &&
    minimalPlan.ok &&
    Object.keys(plan.headers).length > Object.keys(minimalPlan.headers).length
  ) {
    const retryMinimal = await attemptDirect(minimalPlan.urls, minimalPlan.headers);
    if (retryMinimal.ok) {
      return {
        ok: true,
        models: retryMinimal.models,
        resolvedUrl: retryMinimal.resolvedUrl,
        usedFallbackV1: retryMinimal.usedFallbackV1,
        viaProxy: false,
      };
    }
  }

  return {
    ok: false,
    error: firstAttempt.error,
    isCorsOrNetworkError: firstAttempt.isCorsOrNetworkError,
    attemptedUrls: plan.urls,
  };
}
