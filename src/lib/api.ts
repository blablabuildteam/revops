import { Company, NewOpportunity, Opportunity } from "./types";

const base = "/api";

async function req<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export function getOpportunities(): Promise<Opportunity[]> {
  return req("/opportunities");
}

export function getOpportunity(id: string): Promise<Opportunity> {
  return req(`/opportunities/${id}`);
}

export function createOpportunity(opp: NewOpportunity): Promise<Opportunity> {
  return req("/opportunities", { method: "POST", body: JSON.stringify(opp) });
}

export function updateOpportunity(
  id: string,
  updates: Partial<NewOpportunity>
): Promise<Opportunity> {
  return req(`/opportunities/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function deleteOpportunity(id: string): Promise<void> {
  return req(`/opportunities/${id}`, { method: "DELETE" });
}

export function getCompanies(): Promise<Company[]> {
  return req("/companies");
}

export function createCompany(
  company: Omit<Company, "id" | "created_at" | "updated_at">
): Promise<Company> {
  return req("/companies", { method: "POST", body: JSON.stringify(company) });
}
