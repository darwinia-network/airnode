import { mockEthers } from '../../../test/mock-utils';

const failMock = jest.fn();
const fulfillMock = jest.fn();
const staticFulfillMock = jest.fn();
const estimateFulfillMock = jest.fn();
mockEthers({
  airnodeRrpMocks: {
    callStatic: {
      fulfill: staticFulfillMock,
    },
    estimateGas: {
      fulfill: estimateFulfillMock,
    },
    fail: failMock,
    fulfill: fulfillMock,
  },
});

import { ethers } from 'ethers';
import { GasTarget } from '@api3/airnode-utilities';
import * as apiCalls from './api-calls';
import * as fixtures from '../../../test/fixtures';
import * as wallet from '../wallet';
import { RequestErrorMessage } from '../../types';
import { AirnodeRrpV0 } from '../contracts';
import { MAXIMUM_ONCHAIN_ERROR_LENGTH } from '../../constants';

const createAirnodeRrpFake = () => new ethers.Contract('address', ['ABI']) as unknown as AirnodeRrpV0;
const config = fixtures.buildConfig();

describe('submitApiCall', () => {
  const masterHDNode = wallet.getMasterHDNode(config);

  const gasTarget: GasTarget = {
    type: 2,
    maxPriorityFeePerGas: ethers.BigNumber.from(1),
    maxFeePerGas: ethers.BigNumber.from(1000),
    gasLimit: ethers.BigNumber.from(500_000),
  };
  const gasTargetFallback: GasTarget = {
    type: 0,
    gasPrice: ethers.BigNumber.from('1000'),
    gasLimit: ethers.BigNumber.from(500_000),
  };

  const gasTargetWithoutGasLimit: GasTarget = {
    type: 2,
    maxPriorityFeePerGas: ethers.BigNumber.from(1),
    maxFeePerGas: ethers.BigNumber.from(1000),
  };
  const gasTargetFallbackWithoutGasLimit: GasTarget = {
    type: 0,
    gasPrice: ethers.BigNumber.from('1000'),
  };

  test.each([gasTarget, gasTargetFallback, gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
    `does nothing for API call requests that do not have a nonce - %#`,
    async (gasTarget) => {
      const provider = new ethers.providers.JsonRpcProvider();
      const apiCall = fixtures.requests.buildSuccessfulApiCall({ nonce: undefined });
      const [logs, err, data] = await apiCalls.submitApiCall(createAirnodeRrpFake(), apiCall, {
        gasTarget,
        masterHDNode,
        provider,
      });
      expect(logs).toEqual([
        {
          level: 'ERROR',
          message: `API call for Request:${apiCall.id} cannot be submitted as it does not have a nonce`,
        },
      ]);
      expect(err).toEqual(null);
      expect(data).toEqual(null);
      expect(staticFulfillMock).not.toHaveBeenCalled();
      expect(fulfillMock).not.toHaveBeenCalled();
      expect(failMock).not.toHaveBeenCalled();
    }
  );

  test.each([gasTarget, gasTargetFallback])(
    `call 'testAndSubmitFulfill' if 'gasLimit' is specified - %#`,
    async (gasTarget) => {
      const provider = new ethers.providers.JsonRpcProvider();
      const apiCall = fixtures.requests.buildSuccessfulApiCall({
        id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
        data: {
          encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
          signature:
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
        },
        nonce: 5,
      });
      await apiCalls.submitApiCall(createAirnodeRrpFake(), apiCall, {
        gasTarget,
        masterHDNode,
        provider,
      });
      expect(estimateFulfillMock).not.toHaveBeenCalled();
    }
  );

  test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
    `call 'estimateGasAndSubmitFulfill' if 'gasLimit' isn't specified - %#`,
    async (gasTarget) => {
      const provider = new ethers.providers.JsonRpcProvider();
      const apiCall = fixtures.requests.buildSuccessfulApiCall({
        id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
        data: {
          encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
          signature:
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
        },
        nonce: 5,
      });
      await apiCalls.submitApiCall(createAirnodeRrpFake(), apiCall, {
        gasTarget,
        masterHDNode,
        provider,
      });
      expect(estimateFulfillMock).toHaveBeenCalled();
    }
  );

  describe('testAndSubmitFulfill', () => {
    describe('Pending API calls', () => {
      test.each([gasTarget, gasTargetFallback])(
        `successfully tests and submits a fulfill transaction for pending requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          staticFulfillMock.mockResolvedValueOnce({ callSuccess: true, callData: '0x' });
          fulfillMock.mockResolvedValueOnce({ hash: '0xtransactionId' });

          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fulfillment for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xtransactionId' },
          });
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).toHaveBeenCalledTimes(1);
          expect(fulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(failMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `returns an error if the fulfill transaction for pending requests fails - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          staticFulfillMock.mockResolvedValueOnce({ callSuccess: true, callData: '0x' });
          (fulfillMock as any).mockRejectedValueOnce(new Error('Server did not respond'));
          (fulfillMock as any).mockRejectedValueOnce(new Error('Server did not respond'));

          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fulfillment for Request:${apiCall.id}...` },
            {
              error: new Error('Server did not respond'),
              level: 'ERROR',
              message:
                'Error submitting API call fulfillment transaction for Request:0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            },
          ]);
          expect(err).toEqual(new Error('Server did not respond'));
          expect(data).toEqual(null);
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).toHaveBeenCalledTimes(2);
          expect(fulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(failMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `submits a fail transaction if the fulfill call would revert with empty string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          staticFulfillMock.mockResolvedValueOnce({ callSuccess: false, callData: '0x' });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: 'Fulfill transaction failed',
          });
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            'No revert string',
            txOpts
          );
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `submits a fail transaction if the fulfill call would revert with a revert string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          staticFulfillMock.mockResolvedValueOnce({
            callSuccess: false,
            callData:
              '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e416c776179732072657665727473000000000000000000000000000000000000',
          });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: 'Fulfill transaction failed',
          });
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            'Always reverts',
            txOpts
          );
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `does nothing if the fulfill test returns nothing - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          staticFulfillMock.mockResolvedValueOnce(null);
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            {
              level: 'ERROR',
              message: `Fulfill attempt for Request:${apiCall.id} responded with unexpected value: 'null'`,
            },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual(null);
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTarget, gasTargetFallback])(`returns an error if everything fails - %#`, async (gasTarget) => {
        const txOpts = { ...gasTarget, nonce: 5 };
        const provider = new ethers.providers.JsonRpcProvider();
        const staticCallError = new Error('Static call error');
        staticFulfillMock.mockRejectedValueOnce(staticCallError);
        staticFulfillMock.mockRejectedValueOnce(staticCallError);
        const failTxError = new Error('Fail transaction error');
        failMock.mockRejectedValueOnce(failTxError);
        failMock.mockRejectedValueOnce(failTxError);
        const apiCall = fixtures.requests.buildSuccessfulApiCall({
          id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
          data: {
            encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            signature:
              '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
          },
          nonce: 5,
        });
        const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
          gasTarget,
          masterHDNode,
          provider,
        });
        expect(logs).toEqual([
          { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
          {
            error: staticCallError,
            level: 'ERROR',
            message: `Static call fulfillment failed for Request:${apiCall.id} with ${staticCallError}`,
          },
          { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          {
            error: failTxError,
            level: 'ERROR',
            message: `Error submitting API call fail transaction for Request:${apiCall.id}`,
          },
        ]);
        expect(err).toEqual(failTxError);
        expect(data).toEqual(null);
        expect(staticFulfillMock).toHaveBeenCalledTimes(2);
        expect(staticFulfillMock).toHaveBeenNthCalledWith(
          2,
          apiCall.id,
          apiCall.airnodeAddress,
          apiCall.fulfillAddress,
          apiCall.fulfillFunctionId,
          '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
          '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
          txOpts
        );
        expect(fulfillMock).not.toHaveBeenCalled();
        expect(failMock).toHaveBeenCalledTimes(2);
        expect(failMock).toHaveBeenNthCalledWith(
          2,
          apiCall.id,
          apiCall.airnodeAddress,
          apiCall.fulfillAddress,
          apiCall.fulfillFunctionId,
          'Static call error',
          txOpts
        );
      });
    });

    describe('Errored API calls', () => {
      test.each([gasTarget, gasTargetFallback])(
        `submits a fail transaction with errorMessage for errored requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          failMock.mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildFailedApiCall({
            errorMessage: RequestErrorMessage.ApiCallFailed,
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: 'API call failed',
          });
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            RequestErrorMessage.ApiCallFailed,
            txOpts
          );
          expect(staticFulfillMock).not.toHaveBeenCalled();
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `submits a fail transaction with a trimmed errorMessage for errored requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const longError = 'This very long error message should get trimmed'.repeat(10);
          const trimmedError = longError.substring(0, MAXIMUM_ONCHAIN_ERROR_LENGTH - 3).concat('...');
          failMock.mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildFailedApiCall({
            errorMessage: longError,
            nonce: 5,
          });

          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });

          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: longError,
          });
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            trimmedError,
            txOpts
          );
          expect(staticFulfillMock).not.toHaveBeenCalled();
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTarget, gasTargetFallback])(
        `returns an error if the error transaction fails - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          failMock.mockRejectedValueOnce(new Error('Server did not respond'));
          // We need to do this twice because promise-utils will retry
          failMock.mockRejectedValueOnce(new Error('Server did not respond'));
          const apiCall = fixtures.requests.buildFailedApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            errorMessage: `${RequestErrorMessage.ApiCallFailed} with error: Server did not respond`,
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.testAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
            {
              error: new Error('Server did not respond'),
              level: 'ERROR',
              message: `Error submitting API call fail transaction for Request:${apiCall.id}`,
            },
          ]);
          expect(err).toEqual(new Error('Server did not respond'));
          expect(data).toEqual(null);
          expect(failMock).toHaveBeenCalledTimes(2);
          expect(failMock).toHaveBeenNthCalledWith(
            2,
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `${RequestErrorMessage.ApiCallFailed} with error: Server did not respond`,
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('estimateGasAndSubmitFulfill', () => {
    describe('Pending API calls', () => {
      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `successfully estimates gas and submits a fulfill transaction for pending requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          estimateFulfillMock.mockResolvedValueOnce(73804);
          fulfillMock.mockResolvedValueOnce({ hash: '0xtransactionId' });

          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            { level: 'INFO', message: `Gas limit is set to ${73804} for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fulfillment for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xtransactionId' },
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(1);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(fulfillMock).toHaveBeenCalledTimes(1);
          expect(fulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            { ...txOpts, gasLimit: 73804 }
          );
          expect(failMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `returns an error if the fulfill transaction for pending requests fails - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          estimateFulfillMock.mockResolvedValueOnce(73804);
          (fulfillMock as any).mockRejectedValueOnce(new Error('Server did not respond'));
          (fulfillMock as any).mockRejectedValueOnce(new Error('Server did not respond'));

          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            { level: 'INFO', message: `Gas limit is set to ${73804} for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fulfillment for Request:${apiCall.id}...` },
            {
              error: new Error('Server did not respond'),
              level: 'ERROR',
              message:
                'Error submitting API call fulfillment transaction for Request:0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            },
          ]);
          expect(err).toEqual(new Error('Server did not respond'));
          expect(data).toEqual(null);
          expect(estimateFulfillMock).toHaveBeenCalledTimes(1);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(fulfillMock).toHaveBeenCalledTimes(2);
          expect(fulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            { ...txOpts, gasLimit: 73804 }
          );
          expect(failMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is failed but following static call is successful - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const estimateGasError = new Error('Estimate gas error');
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          staticFulfillMock.mockResolvedValueOnce({ callSuccess: true, callData: '0x' });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            {
              error: estimateGasError,
              level: 'ERROR',
              message: `Gas estimation for API call fulfillment failed for Request:${apiCall.id} with ${estimateGasError}`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Gas estimation failed with error: ${estimateGasError.message}`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(2);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            estimateGasError.message,
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is failed and following static call is also failed with revert string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const estimateGasError = new Error('Estimate gas error');
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          staticFulfillMock.mockResolvedValueOnce({
            callSuccess: false,
            callData:
              '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e416c776179732072657665727473000000000000000000000000000000000000',
          });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            {
              error: estimateGasError,
              level: 'ERROR',
              message: `Gas estimation for API call fulfillment failed for Request:${apiCall.id} with ${estimateGasError}`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Fulfill transaction failed`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(2);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `Always reverts`,
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is failed and following static call is also failed with empty string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const estimateGasError = new Error('Estimate gas error');
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          staticFulfillMock.mockResolvedValueOnce({
            callSuccess: false,
            callData: '0x',
          });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            {
              error: estimateGasError,
              level: 'ERROR',
              message: `Gas estimation for API call fulfillment failed for Request:${apiCall.id} with ${estimateGasError}`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Fulfill transaction failed`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(2);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `No revert string`,
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is resolved with null but following static call is successful - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          estimateFulfillMock.mockResolvedValueOnce(null);
          staticFulfillMock.mockResolvedValueOnce({ callSuccess: true, callData: '0x' });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Gas estimation failed`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(1);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            'Gas estimation failed',
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is resolved with null and following static call is also failed with revert string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          estimateFulfillMock.mockResolvedValueOnce(null);
          staticFulfillMock.mockResolvedValueOnce({
            callSuccess: false,
            callData:
              '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e416c776179732072657665727473000000000000000000000000000000000000',
          });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Fulfill transaction failed`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(1);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `Always reverts`,
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction if the gas estimation is resolved with null and following static call is also failed with empty string - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          estimateFulfillMock.mockResolvedValueOnce(null);
          staticFulfillMock.mockResolvedValueOnce({
            callSuccess: false,
            callData: '0x',
          });
          (failMock as jest.Mock).mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: `Fulfill transaction failed`,
          });
          expect(estimateFulfillMock).toHaveBeenCalledTimes(1);
          expect(estimateFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(1);
          expect(staticFulfillMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `No revert string`,
            txOpts
          );
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `returns an error if everything fails - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const estimateGasError = new Error('Estimate gas error');
          const staticCallError = new Error('Static call error');
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          estimateFulfillMock.mockRejectedValueOnce(estimateGasError);
          staticFulfillMock.mockRejectedValueOnce(staticCallError);
          staticFulfillMock.mockRejectedValueOnce(staticCallError);

          const failTxError = new Error('Fail transaction error');
          failMock.mockRejectedValueOnce(failTxError);
          failMock.mockRejectedValueOnce(failTxError);
          const apiCall = fixtures.requests.buildSuccessfulApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            data: {
              encodedValue: '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
              signature:
                '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            },
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'DEBUG',
              message: `Attempting to estimate gas for API call fulfillment for Request:${apiCall.id}...`,
            },
            {
              error: estimateGasError,
              level: 'ERROR',
              message: `Gas estimation for API call fulfillment failed for Request:${apiCall.id} with ${estimateGasError}`,
            },
            { level: 'DEBUG', message: `Attempting to fulfill API call for Request:${apiCall.id}...` },
            {
              error: staticCallError,
              level: 'ERROR',
              message: `Static call fulfillment failed for Request:${apiCall.id} with ${staticCallError}`,
            },
            { level: 'INFO', message: `Submitting API call fail for Request:${apiCall.id}...` },
            {
              error: failTxError,
              level: 'ERROR',
              message: `Error submitting API call fail transaction for Request:${apiCall.id}`,
            },
          ]);
          expect(err).toEqual(failTxError);
          expect(data).toEqual(null);
          expect(estimateFulfillMock).toHaveBeenCalledTimes(2);
          expect(estimateFulfillMock).toHaveBeenNthCalledWith(
            2,
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b'
          );
          expect(staticFulfillMock).toHaveBeenCalledTimes(2);
          expect(staticFulfillMock).toHaveBeenNthCalledWith(
            2,
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            '0x448b8ad3a330cf8f269f487881b59efff721b3dfa8e61f7c8fd2480389459ed3',
            '0xda6d5aa27f48aa951ba401c8a779645f7d1fa4a46a5e99eb7da04b4e059449a834ca1058c85dfe8117305265228f8cf7ae64c3ef3c4d1cc191f77807227dac461b',
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
          expect(failMock).toHaveBeenCalledTimes(2);
          expect(failMock).toHaveBeenNthCalledWith(
            2,
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            'Static call error',
            txOpts
          );
        }
      );
    });

    describe('Errored API calls', () => {
      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction with errorMessage for errored requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          failMock.mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildFailedApiCall({
            errorMessage: RequestErrorMessage.ApiCallFailed,
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: 'API call failed',
          });
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            RequestErrorMessage.ApiCallFailed,
            txOpts
          );
          expect(staticFulfillMock).not.toHaveBeenCalled();
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `submits a fail transaction with a trimmed errorMessage for errored requests - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          const longError = 'This very long error message should get trimmed'.repeat(10);
          const trimmedError = longError.substring(0, MAXIMUM_ONCHAIN_ERROR_LENGTH - 3).concat('...');
          failMock.mockResolvedValueOnce({ hash: '0xfailtransaction' });
          const apiCall = fixtures.requests.buildFailedApiCall({
            errorMessage: longError,
            nonce: 5,
          });

          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });

          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
          ]);
          expect(err).toEqual(null);
          expect(data).toEqual({
            ...apiCall,
            fulfillment: { hash: '0xfailtransaction' },
            errorMessage: longError,
          });
          expect(failMock).toHaveBeenCalledTimes(1);
          expect(failMock).toHaveBeenCalledWith(
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            trimmedError,
            txOpts
          );
          expect(staticFulfillMock).not.toHaveBeenCalled();
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );

      test.each([gasTargetWithoutGasLimit, gasTargetFallbackWithoutGasLimit])(
        `returns an error if the error transaction fails - %#`,
        async (gasTarget) => {
          const txOpts = { ...gasTarget, nonce: 5 };
          const provider = new ethers.providers.JsonRpcProvider();
          failMock.mockRejectedValueOnce(new Error('Server did not respond'));
          // We need to do this twice because promise-utils will retry
          failMock.mockRejectedValueOnce(new Error('Server did not respond'));
          const apiCall = fixtures.requests.buildFailedApiCall({
            id: '0xb56b66dc089eab3dc98672ea5e852488730a8f76621fd9ea719504ea205980f8',
            errorMessage: `${RequestErrorMessage.ApiCallFailed} with error: Server did not respond`,
            nonce: 5,
          });
          const [logs, err, data] = await apiCalls.estimateGasAndSubmitFulfill(createAirnodeRrpFake(), apiCall, {
            gasTarget,
            masterHDNode,
            provider,
          });
          expect(logs).toEqual([
            {
              level: 'INFO',
              message: `Submitting API call fail for Request:${apiCall.id}...`,
            },
            {
              error: new Error('Server did not respond'),
              level: 'ERROR',
              message: `Error submitting API call fail transaction for Request:${apiCall.id}`,
            },
          ]);
          expect(err).toEqual(new Error('Server did not respond'));
          expect(data).toEqual(null);
          expect(failMock).toHaveBeenCalledTimes(2);
          expect(failMock).toHaveBeenNthCalledWith(
            2,
            apiCall.id,
            apiCall.airnodeAddress,
            apiCall.fulfillAddress,
            apiCall.fulfillFunctionId,
            `${RequestErrorMessage.ApiCallFailed} with error: Server did not respond`,
            txOpts
          );
          expect(fulfillMock).not.toHaveBeenCalled();
        }
      );
    });
  });
});
