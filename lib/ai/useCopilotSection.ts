'use client';
import { useCallback, useEffect } from 'react';
export const COPILOT_SECTION_EVENT='msp-copilot-section';
export type CopilotSectionEvent={section:string;symbol:string;token:string|null};
/** A section publishes exactly the token attached to the response it displays. No client values are signed. */
export function useCopilotSection(section:string,symbol:string) {
  const publish=useCallback((token:unknown)=>window.dispatchEvent(new CustomEvent<CopilotSectionEvent>(COPILOT_SECTION_EVENT,{detail:{section,symbol,token:typeof token==='string'?token:null}})),[section,symbol]);
  useEffect(()=>()=>{publish(null);},[publish]);
  return publish;
}
