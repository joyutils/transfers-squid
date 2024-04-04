import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v2001 from '../v2001'

export const memberRemarked =  {
    name: 'Members.MemberRemarked',
    v1000: new EventType(
        'Members.MemberRemarked',
        sts.tuple([sts.bigint(), sts.bytes()])
    ),
    v2001: new EventType(
        'Members.MemberRemarked',
        sts.tuple([sts.bigint(), sts.bytes(), sts.option(() => sts.tuple(() => [v2001.AccountId32, sts.bigint()]))])
    ),
}
