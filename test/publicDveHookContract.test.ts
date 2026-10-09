import {expectTypeOf,it} from 'vitest';
import type {DVEResponse,useDVE} from '@/app/v2/_lib/api';
import type {PublicDveReading} from '@/lib/research/publicDve';
it('shared response and hook expose the public reading, not any or the internal model',()=>{
 expectTypeOf<DVEResponse['data']>().toEqualTypeOf<PublicDveReading | undefined>();
 expectTypeOf<NonNullable<ReturnType<typeof useDVE>['data']>['data']>().toEqualTypeOf<PublicDveReading | undefined>();
 expectTypeOf<NonNullable<ReturnType<typeof useDVE>['data']>>().not.toBeAny();
});
