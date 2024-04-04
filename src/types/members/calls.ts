import {sts, Block, Bytes, Option, Result, CallType, RuntimeCtx} from '../support'
import * as v2001 from '../v2001'

export const memberRemark =  {
    name: 'Members.member_remark',
    /**
     * Member makes a remark
     * 
     * <weight>
     * 
     * ## Weight
     * `O (1)`
     * - DB:
     *    - O(1) doesn't depend on the state or parameters
     * # </weight>
     */
    v1000: new CallType(
        'Members.member_remark',
        sts.struct({
            memberId: sts.bigint(),
            msg: sts.bytes(),
        })
    ),
    /**
     * Member makes a remark
     * 
     * <weight>
     * 
     * ## Weight
     * `O (1)`
     * - DB:
     *    - O(1) doesn't depend on the state or parameters
     * # </weight>
     */
    v2001: new CallType(
        'Members.member_remark',
        sts.struct({
            memberId: sts.bigint(),
            msg: sts.bytes(),
            payment: sts.option(() => sts.tuple(() => [v2001.AccountId32, sts.bigint()])),
        })
    ),
}
