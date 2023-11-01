import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type StakingHelperConfig = {
    master: Address;
    item: Address;
};

export function stakingHelperConfigToCell(config: StakingHelperConfig): Cell {
    return beginCell().storeAddress(config.master).storeAddress(config.item).storeUint(0, 138).endCell();
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

    async sendClaim(provider: ContractProvider, via: Sender, value: bigint, queryId: bigint, returnItem: boolean) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x75938797, 32).storeUint(queryId, 64).storeBit(returnItem).endCell(),
        });
    }

    async getContractData(provider: ContractProvider): Promise<{
        master: Address;
        item: Address;
        staker: Address | null;
        stakedAt: number;
        claimedAt: number;
        option: number;
    }> {
        let stack = (await provider.get('get_contract_data', [])).stack;
        return {
            master: stack.readAddress(),
            item: stack.readAddress(),
            staker: stack.readAddressOpt(),
            stakedAt: stack.readNumber(),
            claimedAt: stack.readNumber(),
            option: stack.readNumber(),
        };
    }
}
