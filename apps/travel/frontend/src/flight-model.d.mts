export interface Candidate {ident:string;ident_iata?:string;actual_ident?:string;source?:string;operator_iata?:string;origin_iata:string;destination_iata:string;origin_timezone:string;destination_timezone:string;scheduled_out:string;scheduled_in:string;status?:string;fa_flight_id?:string|null;}
export interface Clock {day:string;time:string;stamp:string;zone:string;offset:string;}
export function localClock(iso:string|null|undefined,zone:string|null|undefined):Clock|null;
export function clockLabel(iso:string|null|undefined,zone:string|null|undefined):string;
export function scheduleNotice(flight:Candidate|null|undefined,fetchedAt:string|null|undefined):string;
export function scheduleChangeNote(current:Record<string,unknown>,flight:Candidate):string;
export function lookupStillCurrent(startedEpoch:number,currentEpoch:number):boolean;
export function clearPrivateDraft():{values:Record<string,unknown>;overrides:string[];filled:string[];flightDate:string;selected:null};
export function departureDay(flight:Candidate):string;
export function arrivalNote(flight:Candidate):string;
export const FLIGHT_LOOKUP_DELAY: number;
export function lookupQuery(ident:string,date:string):{ident:string;depart_on:string}|null;
export function decideCandidates(flights:Candidate[],date:string,options?:{incomplete?:boolean}):{kind:string;flight?:Candidate;flights:Candidate[];note:string};
export function fillPreview(current:Record<string,unknown>,flight:Candidate,overrides:string[]):{values:Record<string,unknown>;filled:string[];overrides:string[]};
export function useSchedule(current:Record<string,unknown>,flight:Candidate):{values:Record<string,unknown>;filled:string[];overrides:string[]};
export function editManually(current:Record<string,unknown>):{values:Record<string,unknown>;filled:string[];overrides:string[]};
export function invalidateCandidate(current:Record<string,unknown>,filled:string[],overrides:string[]):Record<string,unknown>;
export function overridesFromSaved(item:Record<string,unknown>):string[];
export function flightProblem(error:unknown):{kind:string;message:string};
export const SCHEDULE_FIELDS:string[];
