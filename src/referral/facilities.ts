/** MOCK DATA — fictional facilities for the demo. Not real facility data. */
export interface Facility {
  id: string;
  name: string;
  type: string;
  distanceKm: number;
  travel: string;
}

export const MOCK_FACILITIES: Facility[] = [
  { id: 'rs-kab', name: 'Sample District Hospital (MOCK)', type: 'Referral hospital', distanceKm: 142, travel: '~5 h by road (MOCK)' },
  { id: 'pkm-induk', name: 'Sample Main Health Center (MOCK)', type: 'Inpatient health center', distanceKm: 38, travel: '~1.5 h by road (MOCK)' },
  { id: 'rs-prov', name: 'Sample Provincial Hospital (MOCK)', type: 'Referral hospital', distanceKm: 310, travel: '~9 h by road / 1 h by air (MOCK)' },
];
