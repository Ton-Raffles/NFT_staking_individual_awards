import { toNano } from '@ton/core';
import { StakingMaster } from '../wrappers/StakingMaster';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const stakingMaster = provider.open(StakingMaster.createFromConfig({}, await compile('StakingMaster')));

    await stakingMaster.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(stakingMaster.address);

    // run methods on `stakingMaster`
}
