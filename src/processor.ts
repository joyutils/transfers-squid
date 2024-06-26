import { lookupArchive } from "@subsquid/archive-registry"
import {
  BlockHeader,
  DataHandlerContext,
  SubstrateBatchProcessor,
  SubstrateBatchProcessorFields,
  Event as _Event,
  Call as _Call,
  Extrinsic as _Extrinsic,
} from "@subsquid/substrate-processor"

import { calls } from "./types"

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "wss://rpc.joyutils.org"

console.log(`Connecting to RPC endpoint: ${RPC_ENDPOINT}`)

export const processor = new SubstrateBatchProcessor()
  // Lookup archive by the network name in Subsquid registry
  // See https://docs.subsquid.io/substrate-indexing/supported-networks/
  .setGateway(lookupArchive("joystream", { release: "ArrowSquid" }))
  // Chain RPC endpoint is required on Substrate for metadata and real-time updates
  .setRpcEndpoint({
    // Set via .env for local runs or via secrets when deploying to Subsquid Cloud
    // https://docs.subsquid.io/deploy-squid/env-variables/
    url: RPC_ENDPOINT,
    // More RPC connection options at https://docs.subsquid.io/substrate-indexing/setup/general/#set-data-source
    rateLimit: 1000,
  })
  .addCall({
    name: [calls.balances.transfer.name],
    extrinsic: true,
    events: true,
  })
  .addCall({
    name: [calls.balances.transferAll.name],
    extrinsic: true,
    events: true,
  })
  .addCall({
    name: [calls.balances.transferKeepAlive.name],
    extrinsic: true,
    events: true,
  })
  .addCall({
    name: [calls.members.memberRemark.name],
    extrinsic: true,
    events: true,
  })
  .addCall({
    name: [calls.vesting.vestedTransfer.name],
    extrinsic: true,
    events: true,
  })
  .setFields({
    event: {
      args: true,
    },
    extrinsic: {
      hash: true,
      fee: true,
      signature: true,
    },
    block: {
      timestamp: true,
    },
  })

// Uncomment to disable RPC ingestion and drastically reduce no of RPC calls
//.useArchiveOnly()

export type Fields = SubstrateBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Event = _Event<Fields>
export type Call = _Call<Fields>
export type Extrinsic = _Extrinsic<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
