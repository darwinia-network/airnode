import { ethers } from 'ethers';
import flatMap from 'lodash/flatMap';
import * as logger from '../../logger';
import * as wallet from '../wallet';
import { ApiCall, Config, ClientRequest, LogsData, RequestErrorCode, RequestStatus } from '../../types';

export function verifyDesignatedWallets<T>(
  requests: ClientRequest<T>[],
  masterHDNode: ethers.utils.HDNode
): LogsData<ClientRequest<T>[]> {
  const logsWithVerifiedRequests: LogsData<ClientRequest<T>>[] = requests.map((request) => {
    if (request.status !== RequestStatus.Pending) {
      const log = logger.pend(
        'DEBUG',
        `Designated wallet verification skipped for Request:${request.id} as it has status:${request.status}`
      );
      return [[log], request];
    }

    // We can't validate the wallet if there is no requester index. There should always be one
    // at this point but just in case there isn't.
    if (!request.requesterIndex) {
      const log = logger.pend(
        'ERROR',
        `Ignoring Request:${request.id} as no requester index could be found for designated wallet verification`
      );
      const updatedRequest = {
        ...request,
        status: RequestStatus.Ignored,
        errorCode: RequestErrorCode.TemplateNotFound,
      };
      return [[log], updatedRequest];
    }

    const expectedDesignatedWallet = wallet.deriveWalletAddressFromIndex(masterHDNode, request.requesterIndex);
    if (request.designatedWallet !== expectedDesignatedWallet) {
      const log = logger.pend(
        'ERROR',
        `Invalid designated wallet:${request.designatedWallet} for Request:${request.id}. Expected:${expectedDesignatedWallet}`
      );
      const updatedRequest = {
        ...request,
        status: RequestStatus.Ignored,
        errorCode: RequestErrorCode.DesignatedWalletInvalid,
      };
      return [[log], updatedRequest];
    }

    const log = logger.pend(
      'DEBUG',
      `Request ID:${request.id} is linked to a valid designated wallet:${request.designatedWallet}`
    );
    return [[log], request];
  });

  const logs = flatMap(logsWithVerifiedRequests, (r) => r[0]);
  const verifiedRequests = flatMap(logsWithVerifiedRequests, (r) => r[1]);
  return [logs, verifiedRequests];
}

export function verifyTriggers(
  requests: ClientRequest<ApiCall>[],
  config: Config
): LogsData<ClientRequest<ApiCall>[]> {
  const logsWithVerifiedRequests: LogsData<ClientRequest<ApiCall>>[] = requests.map((request) => {
    if (request.status !== RequestStatus.Pending) {
      const log = logger.pend(
        'DEBUG',
        `Triggers verification skipped for Request:${request.id} as it has status:${request.status}`
      );
      return [[log], request];
    }

    // Check Triggers' endpointId validity/presence
    const trigger = config.triggers.request.find((t) => t.endpointId === request.endpointId);
    if (!trigger) {
      // No valid endpointId was found in the config for this request
      const log = logger.pend(
        'ERROR',
        `Ignoring Request:${request.id} as no valid endpointId exists for triggers in Config`
      );
      const updatedRequest = {
        ...request,
        status: RequestStatus.Errored,
        errorCode: RequestErrorCode.UnknownEndpoint,
      };
      return [[log], updatedRequest];
    }

    const log = logger.pend('DEBUG', `Request ID:${request.id} is linked to a valid endpointId:${request.endpointId}`);
    return [[log], request];
  });

  const logs = flatMap(logsWithVerifiedRequests, (r) => r[0]);
  const verifiedRequests = flatMap(logsWithVerifiedRequests, (r) => r[1]);
  return [logs, verifiedRequests];
}
