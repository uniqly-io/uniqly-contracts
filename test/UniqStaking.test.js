const Web3Utils = require('web3-utils');
const { accounts, contract } = require('@openzeppelin/test-environment');
const {
  BN,           // Big Number support
  time,
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const UniqTokenArtifact = contract.fromArtifact("UniqToken");
const UniqStakingArtifact = contract.fromArtifact("UniqStaking");

const DAYINSEC = 86400;
let gasUsage = [];

let WBN = Web3Utils.BN;

describe("UniqStaking", () => {
  let UniqToken;
  let UniqStaking;
  let [admin, user1, user2, user3] = accounts;

  beforeEach(async () => {
    // get current timestamp 
    UniqToken = await UniqTokenArtifact.new(new BN(Web3Utils.toWei('100000', 'ether')), { from: admin });
    UniqStaking = await UniqStakingArtifact.new("baseUri/", { from: admin });

    // distribute ERC-20 token to test accounts for testing
    await UniqToken.transfer(user1, new BN(Web3Utils.toWei('10000', 'ether')), { from: admin });
    await UniqToken.transfer(user2, new BN(Web3Utils.toWei('10000', 'ether')), { from: admin });
    await UniqToken.transfer(user3, new BN(Web3Utils.toWei('10000', 'ether')), { from: admin });
  })

  describe('add:', () => {
    it('create a new pool', async () => {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      let rec = await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      gasUsage.push({ name: 'addStakePool', value: rec.receipt.gasUsed })
      let poolInfo = await UniqStaking.poolInfo(0);
      assert.equal(poolInfo.slots, new BN(30), 'Holder limit not matching');
      assert.equal(poolInfo.stakeValue, amount, 'Stake minium amount not matching');
      assert.equal(poolInfo.image, 'Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga', 'wrong image hash');
      assert.equal(poolInfo.name, 'Shirt', 'wrong pool name');
    })
  })

  describe('deposit:', () => {
    let amount = new BN(Web3Utils.toWei('1000', 'ether'));
    it('move fund to the contract', async () => {
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });

      // approve and fund
      let rec = await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      gasUsage.push({ name: 'approve', value: rec.receipt.gasUsed });
      let pre_balance = await UniqToken.balanceOf(UniqStaking.address);

      let user = await UniqStaking.userInfo(0, user1);
      assert.equal(user.depositTime, 0, 'date not zero');

      rec = await UniqStaking.deposit(0, amount, { from: user1 });
      gasUsage.push({ name: 'deposit', value: rec.receipt.gasUsed });
      let suf_balance = await UniqToken.balanceOf(UniqStaking.address);
      assert.equal(suf_balance - pre_balance, amount, 'transfer error');

      // should user info be registered
      user = await UniqStaking.userInfo(0, user1);
      assert(user.depositTime > 0, 'date not stored');
    })

    it('should check pool restriction', async () => {
      await UniqStaking.addStakePool(2, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });

      // should check staking minimum amount restriction
      let small_amount = new BN(Web3Utils.toWei('100', 'ether'));
      await UniqToken.approve(UniqStaking.address, small_amount, { from: user1 });
      await expectRevert(
        UniqStaking.deposit(0, small_amount, { from: user1 }),
        'Needs exact stake',
      );

      // should check stakeholder limit
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqToken.approve(UniqStaking.address, amount, { from: user2 });
      await UniqToken.approve(UniqStaking.address, amount, { from: user3 });

      await UniqStaking.deposit(0, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user2 });
      await expectRevert(
        UniqStaking.deposit(0, amount, { from: user3 }),
        'Pool is already full',
      );
    })

    it('slot should be not reusable', async () => {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 1), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });

      await time.increase(DAYINSEC * 1 + 100);
      let rec = await UniqStaking.withdraw(0, { from: user1 });
      gasUsage.push({ name: 'withdraw', value: rec.receipt.gasUsed });

      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await expectRevert(
        UniqStaking.deposit(0, amount, { from: user1 }),
        'User already in staking pool'
      );
    })
  })

  describe('withdraw:', () => {
    let amount = new BN(Web3Utils.toWei('1000', 'ether'));
    it('reject no stakeholders', async () => {
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await expectRevert(
        UniqStaking.withdraw(0, { from: user1 }),
        'Not stakeholder',
      );
    })

    it('lock for 30 days', async () => {
      let stakeWindow = new BN(DAYINSEC * 10);
      let stakeLength = new BN(DAYINSEC * 30);

      await UniqStaking.addStakePool(30, amount, UniqToken.address, stakeWindow, stakeLength, "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      now = await time.latest();
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      let end = new BN(Number(now) + Number(stakeLength));
      expectEvent(await UniqStaking.deposit(0, amount, { from: user1 }),
        'Deposit', {
        user: user1,
        pid: '0',
        amount: amount,
        timeout: end
      });

      // check after 29 days
      await time.increase(DAYINSEC * 29);
      await expectRevert(
        UniqStaking.withdraw(0, { from: user1 }),
        'Still locked',
      );

      // should be withdrew after 30 days
      await time.increase(DAYINSEC + 1);
      let pre_balance = new WBN(await UniqToken.balanceOf(user1));
      expectEvent(await UniqStaking.withdraw(0, { from: user1 }),
        'Withdraw',
        {
          user: user1,
          pid: '0',
          amount: amount
        });
      let suf_balance = new WBN(await UniqToken.balanceOf(user1));
      assert.equal(suf_balance.sub(pre_balance).toString(), amount.toString(), 'amount incorrect');
    })

    it('different fund lock period for each pool', async () => {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 1), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "A", { from: admin });
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 2), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "B", { from: admin });

      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(1, amount, { from: user1 });

      await time.increase(DAYINSEC + 1);
      await UniqStaking.withdraw(0, { from: user1 });

      await time.increase(DAYINSEC + 1);
      await UniqStaking.withdraw(1, { from: user1 });
    })

    it('prevent double withdraw', async () => {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });

      await time.increase(DAYINSEC * 31);
      await UniqStaking.withdraw(0, { from: user1 });
      await expectRevert(
        UniqStaking.withdraw(0, { from: user1 }),
        'Already withdrawn',
      );
    })
  })

  describe('lifetime:', () => {
    it('should prevent deposit after lifetime', async () => {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      await UniqStaking.addStakePool(2, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await time.increase(DAYINSEC * 12);

      await expectRevert(
        UniqStaking.deposit(0, amount, { from: user1 }),
        'Already closed',
      );
    })
  })

  describe('user can check list of stakes', function () {
    it('should return array of old and current stakes', async function () {
      let amount = new BN(Web3Utils.toWei('1000', 'ether'));
      // 10 day window, lock for day
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      // 10 day window, lock for 5 days
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 5), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      // not attending
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 5), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      // another 10 day window, lock for day
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });

      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(1, amount, { from: user1 });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(3, amount, { from: user1 });

      await time.increase(DAYINSEC * 3);
      await UniqStaking.withdraw(0, { from: user1 });
      await UniqStaking.withdraw(3, { from: user1 });
      let past = await UniqStaking.pastStakes(user1);
      let curr = await UniqStaking.currentStakes(user1);
      //console.log(past, curr)
      assert.equal(past.toString(), [new WBN(0), new WBN(3)].toString(), 'past mismatch: ');
      assert.equal(curr.toString(), [new BN(1)].toString(), 'current mismatch: ');
    });
  });

  describe('user can check how long until lock end', function () {
    let amount = new BN(Web3Utils.toWei('1000', 'ether'));

    it('should return zero if not in pool', async function () {
      // 10 day window, lock for 5 days
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 5), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      let ret = await UniqStaking.getCountdown(user1, 0);
      assert.equal(ret, 0, 'bad value returned')
    })
    it('return non-zero for in progress', async function () {
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 5), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await time.increase(DAYINSEC + 1);
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });
      ret = await UniqStaking.getCountdown(user1, 0);
      assert(ret > 0, 'bad value returned: ' + String(ret))
    })
    it('return zero for finished', async function () {
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 5), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });
      await time.increase(DAYINSEC * 20);
      ret = await UniqStaking.getCountdown(user1, 0);
      assert.equal(ret, 0, 'bad value returned' + ret)
    })
  });

  describe('owner can rescue tokens', function () {
    it('should allow withdraw only tokens send badly', async function () {
      let amount = new WBN(Web3Utils.toWei('1000', 'ether'));
      await UniqStaking.addStakePool(30, amount, UniqToken.address, new BN(DAYINSEC * 10), new BN(DAYINSEC * 30), "Qmc1uUGwGqCzFiA28WcA4A5ZceUdasuy3L6f2Qk8kXEyga", "Shirt", { from: admin });
      await UniqToken.approve(UniqStaking.address, amount, { from: user1 });
      await UniqStaking.deposit(0, amount, { from: user1 });
      // send additional tokens directly
      let bad = new WBN(Web3Utils.toWei('1', 'ether'));
      await UniqToken.transfer(UniqStaking.address, bad, { from: user1 });
      let balance = new WBN(await UniqToken.balanceOf(UniqStaking.address));
      assert.equal(balance.toString(), amount.add(bad).toString(), 'transfer failed')

      let rec = await UniqStaking.rescueERC20(UniqToken.address, { from: admin });
      gasUsage.push({ name: 'rescueErc20', value: rec.receipt.gasUsed });
      balance = await UniqToken.balanceOf(UniqStaking.address);
      assert.equal(balance.toString(), amount.toString(), 'rescue failed');
    })
  })
  describe('gas usage log:', function () {
    it('Log gas usage', async function () {
      for (var i = 0; i < gasUsage.length; i++) {
        console.log('\tfunction:', gasUsage[i].name, '\t:', gasUsage[i].value)
      }
    })

  })

})
