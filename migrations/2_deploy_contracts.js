const Presale = artifacts.require("UniqPresale");
const Token = artifacts.require("UniqToken");
const Vesting = artifacts.require("UniqVesting");

function tokens(n) {
  return web3.utils.toWei(n, 'ether')
}

module.exports = async function (deployer, network, accounts) {
  // presaleLimit
  // minPerUser
  // maxPerUser
  // presaleEnd
  // owner
  await deployer.deploy(Presale, tokens('10'), tokens('0.3'), tokens('1'), 1618129340, accounts[0]);
  const presaleA = await Presale.deployed();

  await deployer.deploy(Presale, tokens('20'), tokens('0.3'), tokens('1.2'), 1618129340, accounts[0]);
  const presaleB = await Presale.deployed()

  await presaleA.start();
  web3.eth.sendTransaction({
    from: accounts[0],
    to: presaleA.address,
    value: tokens('1'),
  });

  await presaleB.start();
  web3.eth.sendTransaction({
    from: accounts[0],
    to: presaleB.address,
    value: tokens('0.5'),
  });

  // init balance
  await deployer.deploy(Token, tokens('13000000'));
  const token = await Token.deployed()

  // @param _token address of ERC20 token contract
  // @param _collections address[] of collection contract addresses
  // @param _rate uint256[] ETH/token conversion rate for each contract
  // @param _dateStart uint256 timestamp from when users can start withdrawing tokens 
  await deployer.deploy(Vesting, token.address, [presaleA.address, presaleB.address], [5000, 10000], 1617470256);
  const vesting = await Vesting.deployed()

  // FILL VESTING WITH ERC-20
  token.transfer(vesting.address, tokens('20000'), { from: accounts[0] })
};