const { expect } = require("chai");
const { accounts, contract } = require("@openzeppelin/test-environment");
const {
    BN, // Big Number support
    constants, // Common constants, like the zero address and largest integers
    expectRevert, // Assertions for transactions that should fail
    time
} = require("@openzeppelin/test-helpers");
const expectEvent = require("@openzeppelin/test-helpers/src/expectEvent");

const { ZERO_ADDRESS } = constants;

const mock_721 = contract.fromArtifact("Erc721Mock");
const mock_vest = contract.fromArtifact("VestingMock");
const reward_claim = contract.fromArtifact("RewardClaim");

let vesting;
let token;
let reward;

const [
    owner,
    investor1,
    investor2,
    investor3,
    investor4,
    investor5
] = accounts;

describe("RewardClaim test", function () {

    before(async function () {

        token = await mock_721.new({ from: owner });
        vesting = await mock_vest.new({ from: owner });
        reward = await reward_claim.new(vesting.address, token.address, { from: owner });

        await token.mint(20, owner, 0);
        let list = [[investor1, 1], [investor2, 2], [investor4, 1], [investor5, 2]]
        for (var i = 0; i < list.length; i++) {
            await vesting.registerBonus(list[i][0], list[i][1]);
        }
        expect(await token.ownerOf(1)).to.eql(owner)
        for (var i = 1; i < 15; i++) {
            await token.transferFrom(owner, reward.address, i, { from: owner })
        }
        await reward.registerRewards([13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], { from: owner })
    })

    describe('claim check', function () {
        it('claim investor1 properly', async function () {
            // investor1 should receive one token, nubmer 12
            await reward.claimReward({ from: investor1 })
            expect(await token.ownerOf(12)).to.eql(investor1)
        })
        it('claim investor2 properly', async function () {
            // investor2 should receive two tokens, nubmer 10 and 11
            await reward.claimReward({ from: investor2 })
            expect(await token.ownerOf(11)).to.eql(investor2)
            expect(await token.ownerOf(10)).to.eql(investor2)
        })
        it('throw investor3 properly', async function () {
            // investor3 should throw
            await expectRevert(reward.claimReward({ from: investor3 }), "No reward to claim!")
        })
        it('claim investor4 properly', async function () {
            await reward.claimReward({ from: investor4 })
            expect(await token.ownerOf(9)).to.eql(investor4)
        })
        it('claim investor5 properly', async function () {
            await reward.claimReward({ from: investor5 })
            expect(await token.ownerOf(8)).to.eql(investor5)
            expect(await token.ownerOf(7)).to.eql(investor5)
        })
        it('throw if any want claim again', async function () {
            await expectRevert(reward.claimReward({ from: investor1 }), "Already claimed!")
        })
    })
    describe('readers check', function () {
        it('properly show rewards left', async function () {
            ret = await reward.rewardsLeft();
            expect(ret.toString()).to.eql('7')
        })
        it('properly show next reward', async function () {
            ret = await reward.nextReward();
            expect(ret.toString()).to.eql('6')
        })
    })
})