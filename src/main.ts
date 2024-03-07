import {TypeormDatabase, Store} from '@subsquid/typeorm-store'
import {In} from 'typeorm'
import * as ss58 from '@subsquid/ss58'
import assert from 'assert'

import {processor, ProcessorContext} from './processor'
import {Account, Transfer} from './model'
import {calls, events} from './types'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    let transferEvents: TransferEvent[] = getTransferEvents(ctx)

    let accounts: Map<string, Account> = await createAccounts(ctx, transferEvents)
    let transfers: Transfer[] = createTransfers(transferEvents, accounts)

    await ctx.store.upsert([...accounts.values()])
    await ctx.store.insert(transfers)
})

interface TransferEvent {
    id: string
    blockNumber: number
    blockHash: string
    timestamp: Date
    extrinsicHash?: string
    from: string
    to: string
    amount: bigint
    fee?: bigint
}

function getTransferEvents(ctx: ProcessorContext<Store>): TransferEvent[] {
    // Filters and decodes the arriving events
    let transfers: TransferEvent[] = []
    for (let block of ctx.blocks) {
        for (let call of block.calls) {
            if (call.name === calls.balances.transfer.name || call.name === calls.balances.transferAll.name || call.name === calls.balances.transferKeepAlive.name) {
                const isFailed = call.events.find(e => e.name === events.system.extrinsicFailed.name)
                if (isFailed) {
                    continue
                }
                const event = call.events.find(e => e.name === events.balances.transfer.name)
                if (!event) {
                   continue
                }
                const withdrawEvent = call.events.find(e => e.name === events.balances.withdraw.name)
                if (!withdrawEvent) {
                    throw new  Error(`Transfer call without withdraw event: ${call.extrinsic?.hash}`)
                }
                let rec: {from: string; to: string; amount: bigint}
                if (events.balances.transfer.v1000.is(event)) {
                    const { from, to, amount } = events.balances.transfer.v1000.decode(event)
                    rec = {from, to, amount}
                }
                else {
                    throw new Error('Unsupported spec')
                }
                let fee = 0n
                if (events.balances.withdraw.v1000.is(withdrawEvent)) {
                    const { amount } = events.balances.withdraw.v1000.decode(withdrawEvent)
                    fee = amount
                }

                assert(block.header.timestamp, `Got an undefined timestamp at block ${block.header.height}`)

                transfers.push({
                    id: event.id,
                    blockNumber: block.header.height,
                    blockHash: block.header.hash,
                    timestamp: new Date(block.header.timestamp),
                    extrinsicHash: event.extrinsic?.hash,
                    from: ss58.codec('joystream').encode(rec.from),
                    to: ss58.codec('joystream').encode(rec.to),
                    amount: rec.amount,
                    fee:fee,
                })
            }
        }
    }
    return transfers
}

async function createAccounts(ctx: ProcessorContext<Store>, transferEvents: TransferEvent[]): Promise<Map<string,Account>> {
    const accountIds = new Set<string>()
    for (let t of transferEvents) {
        accountIds.add(t.from)
        accountIds.add(t.to)
    }

    const accounts = await ctx.store.findBy(Account, {id: In([...accountIds])}).then((accounts) => {
        return new Map(accounts.map((a) => [a.id, a]))
    })

    for (let t of transferEvents) {
        updateAccounts(t.from)
        updateAccounts(t.to)
    }

    function updateAccounts(id: string): void {
        const acc = accounts.get(id)
        if (acc == null) {
            accounts.set(id, new Account({id}))
        }
    }

    return accounts
}

function createTransfers(transferEvents: TransferEvent[], accounts: Map<string, Account>): Transfer[] {
    let transfers: Transfer[] = []
    for (let t of transferEvents) {
        let {id, blockNumber, blockHash, timestamp, extrinsicHash, amount, fee} = t
        let from = accounts.get(t.from)
        let to = accounts.get(t.to)
        transfers.push(new Transfer({
            id,
            blockNumber,
            blockHash,
            timestamp,
            extrinsicHash,
            from,
            to,
            amount,
            fee,
        }))
    }
    return transfers
}
