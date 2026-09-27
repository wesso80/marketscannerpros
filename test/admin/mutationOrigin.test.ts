import {describe,it,expect} from 'vitest';
import {validAdminMutationOrigin} from '@/lib/admin/mutationOrigin';
describe('admin public origin behind Render',()=>{
 it('accepts the exact public HTTPS origin despite an internal request URL',()=>{expect(validAdminMutationOrigin('https://marketscannerpros.app','http://localhost:10000')).toBe(true);});
 it('rejects third-party, lookalike, null and insecure public origins',()=>{for(const origin of ['https://evil.example','https://marketscannerpros.app.evil.example','null','http://marketscannerpros.app'])expect(validAdminMutationOrigin(origin,'http://localhost:10000')).toBe(false);});
 it('retains direct same-origin and authenticated non-browser compatibility',()=>{expect(validAdminMutationOrigin('http://localhost:3000','http://localhost:3000')).toBe(true);expect(validAdminMutationOrigin(null,'http://localhost:10000')).toBe(true);});
});
