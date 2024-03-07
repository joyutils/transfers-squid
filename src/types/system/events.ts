import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v1000 from '../v1000'

export const extrinsicSuccess =  {
    name: 'System.ExtrinsicSuccess',
    /**
     * An extrinsic completed successfully.
     */
    v1000: new EventType(
        'System.ExtrinsicSuccess',
        sts.struct({
            dispatchInfo: v1000.DispatchInfo,
        })
    ),
}

export const extrinsicFailed =  {
    name: 'System.ExtrinsicFailed',
    /**
     * An extrinsic failed.
     */
    v1000: new EventType(
        'System.ExtrinsicFailed',
        sts.struct({
            dispatchError: v1000.DispatchError,
            dispatchInfo: v1000.DispatchInfo,
        })
    ),
}
