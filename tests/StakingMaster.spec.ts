import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { StakingMaster } from '../wrappers/StakingMaster';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('StakingMaster', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('StakingMaster');
    });

    let blockchain: Blockchain;
    let stakingMaster: SandboxContract<StakingMaster>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        stakingMaster = blockchain.openContract(StakingMaster.createFromConfig({}, code));

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await stakingMaster.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: stakingMaster.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and stakingMaster are ready to use
    });
});
