export type Role = 'Recruiter' | 'Owner' | 'Super Admin';

export type Stage = 'Lead' | 'Screening' | 'Background Check' | 'Offer' | 'Onboarding';
export const STAGES: Stage[] = ['Lead', 'Screening', 'Background Check', 'Offer', 'Onboarding'];

export interface Carrier {
  id: string;
  name: string;
  dot: string;
  mc: string[];
  authority: 'active' | 'pending' | 'inactive';
  address?: string;
  phone?: string;
}

export type DriverStatus = 'active' | 'inactive' | 'terminated' | 'unassigned' | 'vacation';
export interface Driver {
  id: string;
  carrierId: string;
  name: string;
  score: number;
  license: string;
  state: string;
  status: DriverStatus;
  type: 'company' | 'owner-operator';
  mc?: string;
  phone?: string;
  email?: string;
  driverStatus?: 'Home' | 'Available' | 'On-trip';
  assignedTruckId?: string | null;
  team?: boolean;
  dispatcher?: string;
  hireDate: string;
  isNew?: boolean;
}

export type CandidateStatusTag = 'not_started' | 'in_progress' | 'submitted';
export interface ChecklistStep {
  id: string;
  name: string;
  group: 'Compliance & Eligibility' | 'Risk Screening' | 'Health & Safety' | 'Employment Setup';
  status: 'complete' | 'ready' | 'action';
  description?: string;
  result?: string;
}
export interface Candidate {
  id: string;
  carrierId: string;
  name: string;
  stage: Stage;
  email: string;
  phone?: string;
  ownerUserId?: string;
  statusTag: CandidateStatusTag;
  stageEnteredAt: string;
  winProb?: number;
  amount?: number;
  appProgress?: number;
  assignedTruckId?: string | null;
}

export type TruckStatus = 'Available' | 'Shop' | 'Home' | 'In-Transit' | 'Yard' | 'Inactive' | 'Assigned';
export interface Truck {
  id: string;
  carrierId: string;
  unit: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin: string;
  state: string;
  mc?: string;
  status: TruckStatus;
  fleetStatus?: string;
  ownership: 'company' | 'owner-operator';
  owner?: string;
  operatorDriverId?: string | null;
  odometer?: number;
  regExpiry?: string;
  inspExpiry?: string;
  insExpiry?: string;
}

export interface Employee {
  id: string;
  carrierId: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'ARCHIVED';
  nickname?: string;
  phone?: string;
  email?: string;
  shift?: 'Night shift' | 'Main shift' | 'Afterhours shift';
  role: 'accounting' | 'fleet_management' | 'hr' | 'updater' | 'dispatcher' | 'recruiter';
  kind: 'employee' | 'dispatcher';
}

export type TaskStatus = 'TO DO' | 'IN PROGRESS' | 'REVIEW NEEDED' | 'LONG-TERM' | 'COMPLETE';
export interface TaskChecklistItem { id: string; text: string; done: boolean }
export interface TaskComment { id: string; author: string; text: string; at: string }
export interface Task {
  id: string;
  carrierId: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  start?: string;
  due?: string;
  priority?: 'Urgent' | 'High' | 'Normal';
  comments?: number;
  attachments?: number;
  // rich fields (ClickUp-style task record)
  tags?: string[];
  description?: string;
  timeEstimate?: string;
  checklist?: TaskChecklistItem[];
  commentList?: TaskComment[];
  createdBy?: string;
  source?: string;
  createdAt?: string;
}

export interface NotificationItem {
  id: string;
  actor: string;
  event: string;
  time: string;
  group: 'Yesterday' | 'Last 7 days';
  priority?: 'Urgent' | 'High';
  cleared?: boolean;
}
