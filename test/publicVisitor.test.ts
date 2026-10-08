import { afterEach,it,expect,vi } from 'vitest';
import {issueVisitor,verifyVisitor} from '@/lib/publicVisitor';
afterEach(()=>vi.unstubAllEnvs());
it('authenticates a persistent browser identity, rejecting tampering and expiry',()=>{
 vi.stubEnv('APP_SIGNING_SECRET','local-test-key-only');const t=issueVisitor(1000);
 expect(verifyVisitor(t,1001)).toMatch(/^visitor:/);expect(verifyVisitor(t,1002)).toBe(verifyVisitor(t,1001));
 expect(verifyVisitor(t+'tampered',1001)).toBeNull();expect(verifyVisitor(t,1000+30*86400000)).toBeNull();
 expect(verifyVisitor('forged',1001)).toBeNull();
});
it('never creates unsigned identities when configuration is missing',()=>{
 vi.stubEnv('APP_SIGNING_SECRET','');expect(()=>issueVisitor()).toThrow('signing unavailable');
});
