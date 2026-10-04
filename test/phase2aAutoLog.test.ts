// @vitest-environment jsdom
import {beforeEach, expect, it, vi} from 'vitest';
const operator = vi.hoisted(() => vi.fn(() => ({ mode: 'RESEARCH' })));
vi.mock('@/lib/operatorState', () => ({readOperatorState: operator}));
import {fireAutoLog} from '@/lib/autoLog';
import {setResearchAutoLogEnabled, RESEARCH_AUTO_LOG_KEY} from '@/lib/researchAutoLogSetting';
const payload = {symbol:'SPY',conditionType:'research',conditionMet:'example',triggerPrice:100,source:'markets'};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({entryId:42})})));});
it('default off makes no request and does not even read operator state',async()=>{expect(await fireAutoLog(payload)).toEqual({ok:true,skipped:true});expect(fetch).not.toHaveBeenCalled();expect(operator).not.toHaveBeenCalled();});
it('explicit opt-in enables the existing request and turning off stops it',async()=>{setResearchAutoLogEnabled(true);expect(await fireAutoLog(payload)).toEqual({ok:true,entryId:42});expect(fetch).toHaveBeenCalledTimes(1);setResearchAutoLogEnabled(false);await fireAutoLog(payload);expect(fetch).toHaveBeenCalledTimes(1);});
it('other truthy strings do not opt in',async()=>{localStorage.setItem(RESEARCH_AUTO_LOG_KEY,'1');await fireAutoLog(payload);expect(fetch).not.toHaveBeenCalled();});
it('blocked storage fails closed',async()=>{const spy=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked')});await fireAutoLog(payload);expect(fetch).not.toHaveBeenCalled();spy.mockRestore();});
