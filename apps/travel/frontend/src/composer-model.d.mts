export interface Segment {key:string;arrive:string;leave:string;city?:string;}
export interface RangeModel {start:string;end:string;splits:string[];cities:Record<string,string>;tripName:string;nameTouched:boolean;pto:boolean;anchor:Date;awaitingEnd:boolean;pendingSpan:{start:string;end:string;dropped:Segment[]}|null;}
export function blankRange(start?:string):RangeModel;
export function addDays(iso:string,count:number):string;
export function toIso(date:Date):string;
export function guardSpan(model:RangeModel,start:string,end:string):RangeModel;
export function confirmSpan(model:RangeModel):RangeModel;
export function changeCity(model:RangeModel,iso:string):RangeModel;
export function removeChange(model:RangeModel,iso:string):RangeModel;
export function segments(model:RangeModel):Segment[];
export function defaultTripName(model:RangeModel):string;
export function summaryText(start:string,end:string):string;
export function saveState(model:RangeModel):{ok:boolean;helper:string;field:string;cityKey:string;title:string;parts:(Segment & {city:string})[]};
