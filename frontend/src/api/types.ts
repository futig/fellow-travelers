import type { components } from './schema';

type Schemas = components['schemas'];

export type Contact = Schemas['Contact'];
export type Point = Schemas['Point'];
export type Event = Schemas['Event'];
export type EventCreate = Schemas['EventCreate'];
export type EventUpdate = Schemas['EventUpdate'];
export type EventSummary = Schemas['EventSummary'];
export type Invite = Schemas['Invite'];
export type InvitePreview = Schemas['InvitePreview'];
export type Location = Schemas['Location'];
export type LocationKind = Schemas['LocationKind'];
export type Trip = Schemas['Trip'];
export type TripInput = Schemas['TripInput'];
export type TripUpdate = Schemas['TripUpdate'];
export type Application = Schemas['Application'];
export type ApplicationInput = Schemas['ApplicationInput'];
export type ApplicationStatus = Schemas['ApplicationStatus'];
export type WaitMinutes = Schemas['WaitMinutes'];
export type MarksInput = Schemas['MarksInput'];
export type Transfer = Schemas['Transfer'];
export type TransferMember = Schemas['TransferMember'];
export type MyTrip = Schemas['MyTrip'];
export type AdminParticipant = Schemas['AdminParticipant'];
export type AdminParticipants = Schemas['AdminParticipants'];
export type Counters = Schemas['Counters'];
