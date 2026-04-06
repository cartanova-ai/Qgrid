/**
 * @generated
 * 직접 수정하지 마세요.
 */
/** biome-ignore-all lint: generated는 무시 */
/** biome-ignore-all assist: generated는 무시 */

import type { AsyncIdConfig } from "@sonamu-kit/react-components/components";
import {
  queryOptions,
  type UseMutationOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import qs from "qs";
import {
  CliResult,
  HealthResponse,
  OAuthLoginResult,
  TokenStats,
  UsageResponse,
} from "./bycc/bycc.types";
import { RequestLogListParams, RequestLogSaveParams } from "./request-log/request-log.types";
import { RequestLogSubsetKey, RequestLogSubsetMapping } from "./sonamu.generated";
import {
  type EventHandlers,
  type FilterQuery,
  fetch,
  type ListResult,
  type SSEStreamOptions,
  toFormData,
  useSSEStream,
} from "./sonamu.shared";

export namespace RequestLogService {
  export async function getRequestLog<T extends RequestLogSubsetKey>(
    subset: T,
    id: number,
  ): Promise<RequestLogSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/requestLog/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getRequestLogQueryOptions = <T extends RequestLogSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["RequestLog", "getRequestLog", subset, id],
      queryFn: () => getRequestLog(subset, id),
    });

  export const useRequestLog = <T extends RequestLogSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getRequestLogQueryOptions(subset, id),
      ...options,
    });

  export async function getRequestLogs<
    T extends RequestLogSubsetKey,
    LP extends RequestLogListParams,
  >(subset: T, rawParams?: LP): Promise<ListResult<LP, RequestLogSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/requestLog/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getRequestLogsQueryOptions = <
    T extends RequestLogSubsetKey,
    LP extends RequestLogListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["RequestLog", "getRequestLogs", subset, rawParams],
      queryFn: () => getRequestLogs(subset, rawParams),
    });

  export const useRequestLogs = <T extends RequestLogSubsetKey, LP extends RequestLogListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getRequestLogsQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: RequestLogSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/requestLog/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: RequestLogSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/requestLog/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}

export namespace ByccService {
  export async function query(
    prompt: string,
    system?: string,
    timeout?: number,
  ): Promise<CliResult> {
    return fetch({
      method: "POST",
      url: `/api/bycc/query`,
      data: { prompt, system, timeout },
    });
  }

  export const useQueryMutation = () =>
    useMutation({
      mutationFn: (params: { prompt: string; system: string; timeout: number }) =>
        query(params.prompt, params.system, params.timeout),
    });

  export async function stats(): Promise<TokenStats[]> {
    return fetch({
      method: "GET",
      url: `/api/bycc/stats`,
    });
  }

  export const statsQueryOptions = () =>
    queryOptions({
      queryKey: ["Bycc", "stats"],
      queryFn: () => stats(),
    });

  export const useStats = (options?: { enabled?: boolean }) =>
    useQuery({
      ...statsQueryOptions(),
      ...options,
    });

  export async function addToken(token: string, name?: string): Promise<{ added: boolean }> {
    return fetch({
      method: "POST",
      url: `/api/bycc/addToken`,
      data: { token, name },
    });
  }

  export const useAddTokenMutation = () =>
    useMutation({
      mutationFn: (params: { token: string; name: string }) => addToken(params.token, params.name),
    });

  export async function updateToken(
    token: string,
    name?: string,
    newToken?: string,
  ): Promise<{ updated: boolean }> {
    return fetch({
      method: "POST",
      url: `/api/bycc/updateToken`,
      data: { token, name, newToken },
    });
  }

  export const useUpdateTokenMutation = () =>
    useMutation({
      mutationFn: (params: { token: string; name: string; newToken: string }) =>
        updateToken(params.token, params.name, params.newToken),
    });

  export async function removeToken(token: string): Promise<{ removed: boolean }> {
    return fetch({
      method: "POST",
      url: `/api/bycc/removeToken`,
      data: { token },
    });
  }

  export const useRemoveTokenMutation = () =>
    useMutation({
      mutationFn: (params: { token: string }) => removeToken(params.token),
    });

  export async function oauthLogin(name: string): Promise<OAuthLoginResult> {
    return fetch({
      method: "POST",
      url: `/api/bycc/oauthLogin`,
      data: { name },
    });
  }

  export const useOauthLoginMutation = () =>
    useMutation({
      mutationFn: (params: { name: string }) => oauthLogin(params.name),
    });

  export async function usage(tokenName?: string): Promise<UsageResponse> {
    return fetch({
      method: "GET",
      url: `/api/bycc/usage?${qs.stringify({ tokenName })}`,
    });
  }

  export const usageQueryOptions = (tokenName?: string) =>
    queryOptions({
      queryKey: ["Bycc", "usage", tokenName],
      queryFn: () => usage(tokenName),
    });

  export const useUsage = (tokenName?: string, options?: { enabled?: boolean }) =>
    useQuery({
      ...usageQueryOptions(tokenName),
      ...options,
    });

  export async function health(): Promise<HealthResponse> {
    return fetch({
      method: "GET",
      url: `/api/bycc/health`,
    });
  }

  export const healthQueryOptions = () =>
    queryOptions({
      queryKey: ["Bycc", "health"],
      queryFn: () => health(),
    });

  export const useHealth = (options?: { enabled?: boolean }) =>
    useQuery({
      ...healthQueryOptions(),
      ...options,
    });
}

// AsyncIdConfig: RequestLog
export const RequestLogAsyncIdConfig: AsyncIdConfig<
  RequestLogSubsetKey,
  RequestLogSubsetMapping,
  RequestLogListParams
> = {
  placeholderKey: "entity.RequestLog",
  useList: RequestLogService.useRequestLogs,
};
