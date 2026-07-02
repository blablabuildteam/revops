import { supabase } from "./supabase";
import { Company, NewOpportunity, Opportunity } from "./types";

export async function getOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(`*, company:companies(*)`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Opportunity[];
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(`*, company:companies(*)`)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Opportunity;
}

export async function createOpportunity(opp: NewOpportunity): Promise<Opportunity> {
  const { data, error } = await supabase
    .from("opportunities")
    .insert(opp)
    .select(`*, company:companies(*)`)
    .single();

  if (error) throw error;
  return data as Opportunity;
}

export async function updateOpportunity(
  id: string,
  updates: Partial<NewOpportunity>
): Promise<Opportunity> {
  const { data, error } = await supabase
    .from("opportunities")
    .update(updates)
    .eq("id", id)
    .select(`*, company:companies(*)`)
    .single();

  if (error) throw error;
  return data as Opportunity;
}

export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw error;
}

export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("name");

  if (error) throw error;
  return data as Company[];
}

export async function createCompany(
  company: Omit<Company, "id" | "created_at" | "updated_at">
): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .insert(company)
    .select()
    .single();

  if (error) throw error;
  return data as Company;
}
