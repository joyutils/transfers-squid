import {sts, Block, Bytes, Option, Result, CallType, RuntimeCtx} from '../support'
import * as v1000 from '../v1000'

export const vestedTransfer =  {
    name: 'Vesting.vested_transfer',
    /**
     * Create a vested transfer.
     * 
     * The dispatch origin for this call must be _Signed_.
     * 
     * - `target`: The account receiving the vested funds.
     * - `schedule`: The vesting schedule attached to the transfer.
     * 
     * Emits `VestingCreated`.
     * 
     * NOTE: This will unlock all schedules through the current block.
     * 
     * # <weight>
     * - `O(1)`.
     * - DbWeight: 3 Reads, 3 Writes
     *     - Reads: Vesting Storage, Balances Locks, Target Account, [Sender Account]
     *     - Writes: Vesting Storage, Balances Locks, Target Account, [Sender Account]
     * # </weight>
     */
    v1000: new CallType(
        'Vesting.vested_transfer',
        sts.struct({
            target: v1000.AccountId32,
            schedule: v1000.VestingInfo,
        })
    ),
}
