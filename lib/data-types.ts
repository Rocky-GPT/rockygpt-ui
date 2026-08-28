export interface ShuttleStop { location: string; time: string }
export interface ShuttleRoute { departure: string; stops: ShuttleStop[]; arrival: string }
export interface ShuttleSchedule {
  trainLoop: ShuttleRoute[];
  shortline: {
    toNYC: { weekday: string[]; saturday: string[]; sunday: string[] };
    fromNYC: { weekday: string[]; saturday: string[]; sunday: string[] };
  };
  weekday: ShuttleRoute[];
  saturday: ShuttleRoute[];
  sunday: ShuttleRoute[];
}

export type MapLocationType = 'building' | 'office' | 'parking' | 'layer';
export interface MapLocation {
  key: string;
  name: string;
  type: MapLocationType;
  mapUrl: string;
  aliases: string[];
  roomPrefixes: string[];
  category?: string;
  description?: string;
  buildingKey?: string;
  buildingName?: string;
  officeUrl?: string | null;
  room?: string | null;
}

export type DirectoryTab = 'Offices' | 'Staff & Faculty' | 'Others';
export interface OfficeDirectoryContact {
  name: string; phone: string; category: string; email?: string; department: string;
  office?: string; helpsWith: string[];
}
export interface FacultyStaffContact {
  name: string; title?: string; school?: string; email?: string; phone?: string;
  office?: string; profileUrl?: string; imageUrl?: string;
}
export interface OtherDirectoryContact {
  name: string; title: string; unit?: string; email?: string; phone?: string;
  office?: string; profileUrl?: string;
}
export interface NormalizedDirectoryContact {
  id: string; bucket: DirectoryTab; kind: 'office' | 'person';
  source: 'office-static' | 'faculty-dataset' | 'other-static'; name: string;
  title?: string; category?: string; department?: string; school?: string; unit?: string;
  email?: string; phone?: string; office?: string; profileUrl?: string; imageUrl?: string;
  helpsWith?: string[]; searchText: string;
}
export type EntityKind = 'campus_hours' | 'dining_hours' | 'campus_contacts' | 'clubs' | 'programs';
export interface RegistryEntity { kind: EntityKind; key: string; names: string[]; rowCount: number }
export interface EntityRegistry { datasetVersion: string; generatedAt: string; entities: RegistryEntity[] }
export type EntityRow = Record<string, string | null>;

export type TimestampBasis = 'collector-provenance' | 'embedded-timestamp' | 'file-modified-estimate' | 'missing';
export type FreshnessStatus = 'fresh' | 'stale' | 'unknown' | 'manual';
export interface ScrapeSourceStatus {
  id: string;
  title: string;
  category: string;
  mode: 'API' | 'HTML crawl' | 'Browser' | 'Hybrid';
  summary: string;
  capturedData: string[];
  method: string;
  automation: string;
  commands: string[];
  sourceUrls: Array<{ label: string; url: string }>;
  caveat?: string;
  artifacts: Array<{
    label: string; file: string; role: 'primary' | 'supplemental'; exists: boolean;
    fetchedAt: string | null; timestampBasis: TimestampBasis; timestampDetail: string; summary?: string;
  }>;
  freshnessHours: number | null;
  freshnessStatus: FreshnessStatus;
  ageHours: number | null;
  lastFetchedAt: string | null;
  timestampBasis: TimestampBasis;
}
