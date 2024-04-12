import { TypeormDatabase, Store } from "@subsquid/typeorm-store"
import { In } from "typeorm"
import * as ss58 from "@subsquid/ss58"
import assert from "assert"

import { processor, ProcessorContext } from "./processor"
import { Account, Transfer } from "./model"
import { calls, events } from "./types"

const addressCodec = ss58.codec("joystream")

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
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
  type: "transfer" | "remark" | "vested"
  remark?: string
  vestingDurationBlocks?: bigint
}

function getTransferEvents(ctx: ProcessorContext<Store>): TransferEvent[] {
  // Filters and decodes the arriving events
  let transfers: TransferEvent[] = []
  for (let block of ctx.blocks) {
    for (let call of block.calls) {
      const isFailed =
        call.events.find(
          (e) => e.name === events.system.extrinsicFailed.name,
        ) || call.events.length === 0
      if (isFailed) {
        continue
      }

      const withdrawEvent = call.extrinsic?.events.find(
        (e) => e.name === events.balances.withdraw.name,
      )
      if (!withdrawEvent) {
        console.warn(
          `No withdraw event found for extrinsic ${call.extrinsic?.hash}`,
        )
      }
      let totalFee = 0n
      if (withdrawEvent && events.balances.withdraw.v1000.is(withdrawEvent)) {
        const { amount } = events.balances.withdraw.v1000.decode(withdrawEvent)
        totalFee = amount
      }
      const fee = totalFee / BigInt(call.extrinsic?.subcalls.length || 1)

      if (
        call.name === calls.balances.transfer.name ||
        call.name === calls.balances.transferAll.name ||
        call.name === calls.balances.transferKeepAlive.name
      ) {
        const event = call.events.find(
          (e) => e.name === events.balances.transfer.name,
        )
        if (!event) {
          continue
        }

        let rec: { from: string; to: string; amount: bigint }
        if (events.balances.transfer.v1000.is(event)) {
          const { from, to, amount } =
            events.balances.transfer.v1000.decode(event)
          rec = { from, to, amount }
        } else {
          throw new Error("Unsupported spec")
        }

        assert(
          block.header.timestamp,
          `Got an undefined timestamp at block ${block.header.height}`,
        )

        transfers.push({
          id: call.id,
          blockNumber: block.header.height,
          blockHash: block.header.hash,
          timestamp: new Date(block.header.timestamp),
          extrinsicHash: event.extrinsic?.hash,
          from: addressCodec.encode(rec.from),
          to: addressCodec.encode(rec.to),
          amount: rec.amount,
          fee: fee,
          type: "transfer",
        })
      } else if (call.name === calls.members.memberRemark.name) {
        const event = call.events.find(
          (e) => e.name === events.members.memberRemarked.name,
        )
        if (!event) {
          console.warn(
            `no memberRemarked event found for extrinsic ${call.extrinsic?.hash}`,
          )
          continue
        }
        let rec: { from: string; remark: string; to: string; amount: bigint }
        if (events.members.memberRemarked.v1000.is(event)) {
          // v1000 remark has no payment
          continue
        } else if (events.members.memberRemarked.v2001.is(event)) {
          const [_, remark, maybePayment] =
            events.members.memberRemarked.v2001.decode(event)
          if (!maybePayment) {
            // we don't care about remarks without payment
            continue
          }

          rec = {
            from: addressCodec.encode(
              call.extrinsic?.signature?.address as string,
            ),
            remark,
            to: addressCodec.encode(maybePayment[0]),
            amount: maybePayment[1],
          }
        } else {
          throw new Error("Unsupported spec")
        }

        assert(
          block.header.timestamp,
          `Got an undefined timestamp at block ${block.header.height}`,
        )

        transfers.push({
          id: call.id,
          blockNumber: block.header.height,
          blockHash: block.header.hash,
          timestamp: new Date(block.header.timestamp),
          extrinsicHash: event.extrinsic?.hash,
          from: rec.from,
          to: rec.to,
          fee: fee,
          amount: rec.amount,
          type: "remark",
          remark: rec.remark,
        })
      } else if (call.name === calls.vesting.vestedTransfer.name) {
        let rec: {
          from: string
          to: string
          amount: bigint
          vestingDurationBlocks: bigint
        }
        if (calls.vesting.vestedTransfer.v1000.is(call)) {
          const { target, schedule } =
            calls.vesting.vestedTransfer.v1000.decode(call)
          const { locked, perBlock, startingBlock } = schedule

          const vestingDuration = locked / perBlock
          const vestingDelay = Math.max(startingBlock - block.header.height, 0)
          rec = {
            from: addressCodec.encode(
              call.extrinsic?.signature?.address as string,
            ),
            to: addressCodec.encode(target),
            amount: locked,
            vestingDurationBlocks: vestingDuration + BigInt(vestingDelay),
          }
        } else {
          throw new Error("Unsupported spec")
        }

        assert(
          block.header.timestamp,
          `Got an undefined timestamp at block ${block.header.height}`,
        )

        transfers.push({
          id: call.id,
          blockNumber: block.header.height,
          blockHash: block.header.hash,
          timestamp: new Date(block.header.timestamp),
          extrinsicHash: call.extrinsic?.hash,
          from: rec.from,
          to: rec.to,
          amount: rec.amount,
          fee: fee,
          type: "vested",
          vestingDurationBlocks: rec.vestingDurationBlocks,
        })
      }
    }
  }
  return transfers
}

async function createAccounts(
  ctx: ProcessorContext<Store>,
  transferEvents: TransferEvent[],
): Promise<Map<string, Account>> {
  const accountIds = new Set<string>()
  for (let t of transferEvents) {
    accountIds.add(t.from)
    accountIds.add(t.to)
  }

  const accounts = await ctx.store
    .findBy(Account, { id: In([...accountIds]) })
    .then((accounts) => {
      return new Map(accounts.map((a) => [a.id, a]))
    })

  for (let t of transferEvents) {
    updateAccounts(t.from)
    updateAccounts(t.to)
  }

  function updateAccounts(id: string): void {
    const acc = accounts.get(id)
    if (acc == null) {
      accounts.set(id, new Account({ id }))
    }
  }

  return accounts
}

function createTransfers(
  transferEvents: TransferEvent[],
  accounts: Map<string, Account>,
): Transfer[] {
  let transfers: Transfer[] = []
  for (let t of transferEvents) {
    let {
      id,
      blockNumber,
      blockHash,
      timestamp,
      extrinsicHash,
      amount,
      fee,
      remark,
      type,
      vestingDurationBlocks,
    } = t
    let from = accounts.get(t.from)
    let to = accounts.get(t.to)
    transfers.push(
      new Transfer({
        id,
        blockNumber,
        blockHash,
        timestamp,
        extrinsicHash,
        from,
        to,
        amount,
        fee,
        type,
        remark,
        vestingDurationBlocks,
      }),
    )
  }
  return transfers
}
