import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
} from '@ton/core';
import { StakingHelper } from './StakingHelper';

export type StakingMasterConfig = {
    items: Dictionary<Address, bigint>;
    jettonMaster: Address;
    jettonWalletCode: Cell;
    helperCode: Cell;
};

export function stakingMasterConfigToCell(config: StakingMasterConfig): Cell {
    return beginCell()
        .storeDict(config.items)
        .storeDict(null)
        .storeAddress(config.jettonMaster)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.helperCode)
        .endCell();
}

export class StakingMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new StakingMaster(address);
    }

    static createFromConfig(config: StakingMasterConfig, code: Cell, workchain = 0) {
        const data = stakingMasterConfigToCell(config);
        const init = { code, data };
        return new StakingMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getHelper(provider: ContractProvider, item: Address): Promise<StakingHelper> {
        const stack = (
            await provider.get('get_helper_address', [
                { type: 'slice', cell: beginCell().storeAddress(item).endCell() },
            ])
        ).stack;
        return StakingHelper.createFromAddress(stack.readAddress());
    }
}
