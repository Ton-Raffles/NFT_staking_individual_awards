import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type StakingHelperConfig = {};

export function stakingHelperConfigToCell(config: StakingHelperConfig): Cell {
    return beginCell().endCell();
}

export class StakingHelper implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new StakingHelper(address);
    }

    static createFromConfig(config: StakingHelperConfig, code: Cell, workchain = 0) {
        const data = stakingHelperConfigToCell(config);
        const init = { code, data };
        return new StakingHelper(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
