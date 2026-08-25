import type { Company } from '@/lib/supabase';

export const COMPANY_PROFILE_KEY = 'evu-company-profile';

export const DEFAULT_EVU_NAME = 'AixRail GmbH';
export const DEFAULT_HQ_LOCATION = 'Duisburg';

export interface CompanyProfile {
  name: string;
  hq_location: string;
}

export function loadCompanyProfile(): CompanyProfile | null {
  try {
    const raw = localStorage.getItem(COMPANY_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompanyProfile>;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const hq_location = typeof parsed.hq_location === 'string' ? parsed.hq_location.trim() : '';
    if (!name || !hq_location) return null;
    return { name, hq_location };
  } catch {
    return null;
  }
}

export function saveCompanyProfile(profile: CompanyProfile): void {
  const name = profile.name.trim() || DEFAULT_EVU_NAME;
  const hq_location = profile.hq_location.trim() || DEFAULT_HQ_LOCATION;
  localStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify({ name, hq_location }));
}

export function applyProfileToCompany(company: Company, profile: CompanyProfile | null): Company {
  if (!profile) {
    return {
      ...company,
      hq_location: company.hq_location?.trim() || DEFAULT_HQ_LOCATION,
    };
  }
  return {
    ...company,
    name: profile.name,
    hq_location: profile.hq_location,
  };
}
