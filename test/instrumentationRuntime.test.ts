import {afterEach,expect,it,vi} from 'vitest';
const start=vi.hoisted(()=>vi.fn());
vi.mock('../lib/memory/debugLog',()=>({startMemoryDebugLog:start}));
import {register} from '../instrumentation';
afterEach(()=>{vi.unstubAllEnvs();start.mockClear();});
it.each(['edge',undefined])('does not start the logger in %s',async runtime=>{
 vi.stubEnv('NEXT_RUNTIME',runtime);vi.stubEnv('MEMORY_DEBUG_LOG','true');
 await register();expect(start).not.toHaveBeenCalled();
});
it('keeps logging opt-in on Node',async()=>{
 vi.stubEnv('NEXT_RUNTIME','nodejs');vi.stubEnv('MEMORY_DEBUG_LOG','false');
 await register();expect(start).not.toHaveBeenCalled();
});
it.each([['2500',2500],['invalid',60000],['999',60000]])('preserves interval handling %s',async(raw,expected)=>{
 vi.stubEnv('NEXT_RUNTIME','nodejs');vi.stubEnv('MEMORY_DEBUG_LOG','true');vi.stubEnv('MEMORY_DEBUG_LOG_INTERVAL_MS',raw);
 await register();expect(start).toHaveBeenCalledExactlyOnceWith(expected);
});
