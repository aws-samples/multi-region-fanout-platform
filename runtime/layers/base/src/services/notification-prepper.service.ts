/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  AlertNotification,
  ListTokenAllResponse,
  LoggingServiceInterface,
  NotificationPrepperServiceInterface,
  NotificationPrepperSinkAdapterInterface,
  NotificationPrepperTokenAllAdapterInterface,
  NotificationPrepperTokenSelectedAdapterInterface,
} from './../interfaces';
import {
  BehaviorSubject,
  bufferTime,
  catchError,
  EMPTY,
  from,
  lastValueFrom,
  mergeMap,
  of,
  scan,
} from 'rxjs';
import { v4 } from 'uuid';

export interface NotificationPrepperServiceConfig {
  logger: LoggingServiceInterface;
  allTokenAdapter: NotificationPrepperTokenAllAdapterInterface;
  sinkAdapter: NotificationPrepperSinkAdapterInterface;
  selectedTokenAdapter: NotificationPrepperTokenSelectedAdapterInterface;
  selectedRetrievalSize?: number;
  selectedTokensPerMessage?: number;
  selectedSinkConcurrency?: number;
  selectedPipeSize?: number;
}

function sliceIntoChunks<T>(arr: T[], chunkSize: number) {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}


export class NotificationPrepperService implements NotificationPrepperServiceInterface {
  readonly logger: LoggingServiceInterface;
  readonly allTokenAdapter: NotificationPrepperTokenAllAdapterInterface;
  readonly sinkAdapter: NotificationPrepperSinkAdapterInterface;
  readonly selectedTokenAdapter: NotificationPrepperTokenSelectedAdapterInterface;
  readonly selectedRetrievalSize: number;
  readonly selectedTokensPerMessage: number;
  readonly selectedSinkConcurrency: number;
  readonly selectedPipeSize: number;

  constructor(config: NotificationPrepperServiceConfig) {
    this.logger = config.logger;
    this.allTokenAdapter = config.allTokenAdapter;
    this.sinkAdapter = config.sinkAdapter;
    this.selectedTokenAdapter = config.selectedTokenAdapter;
    this.selectedRetrievalSize = config.selectedRetrievalSize ?? 50000;
    this.selectedTokensPerMessage = config.selectedTokensPerMessage ?? 500;
    this.selectedSinkConcurrency = config.selectedSinkConcurrency ?? 25;
    this.selectedPipeSize = config.selectedPipeSize ?? 100000;
  }

  async enqueueNotifications(
    alertNotification: AlertNotification,
    flowControl: 'all' | 'selected',
  ): Promise<void> {
    // NOTE: As both implementations (RDS vs S3) are vastly different,
    //       we are treating them as completely separated batch processing jobs.
    if (flowControl === 'all') 
      await this.enqueueNotificationsForFlowAllSimple(alertNotification);
    else 
      await this.enqueueNotificationsForFlowSelectedSimple(alertNotification);
    
  }

  private async enqueueNotificationsForFlowAll(
    alertNotification: AlertNotification,
  ): Promise<void> {
    const controller$ = new BehaviorSubject<string>(undefined);
    const processingResult = await controller$
      .pipe(
        mergeMap(
          async (currContinuationToken) => {
            if (currContinuationToken === 'END') {
              this.logger.debug({ message: 'End of processing signaled...\'' });
              return from([]);
            }

            this.logger.debug({ message: `Retrieving objects from S3 for token '${currContinuationToken}'` });
            const listResponse = await this.allTokenAdapter.getTokens(
              alertNotification.provider,
              alertNotification.platform,
              alertNotification.severity,
              currContinuationToken,
            );
            this.logger.debug({ message: `Retrieved objects from S3 for token '${currContinuationToken}'`, data: listResponse });
            return from(listResponse.results.map(r => ({
              continuationToken: listResponse.continuationToken,
              item: r,
            })));
          },
          1, // Note: No concurrency as we need to have the continuation token from S3
        ),
        mergeMap(batchItems => batchItems),
        bufferTime(25000, undefined, 10),
        // Stop processing if the timer in bufferTime was reached but there are no more messages to enqueue
        mergeMap(batchItems => {
          this.logger.debug({ message: `BatchItems: ${batchItems.length}` });
          return batchItems.length > 0 ? of(batchItems) : EMPTY;
        }),
        // Sink all messages into SQS, also allow them to be concurrently sinked
        mergeMap(
          async batchItems => {
            this.logger.debug({ message: `Sinking batches to SQS: ${batchItems.length}` });
            await this.sinkAdapter.sinkBatch(
              alertNotification,
              batchItems.map(b => b.item),
              'all',
            );
            return batchItems;
          },
          100,
        ),
        scan(
          (acc, batchItems) => {
            acc.totalProcessedCount += batchItems.length;
            const newTokens = batchItems.map(b => b.continuationToken).filter(t => t !== acc.currContinuationToken);
            if (newTokens.length > 0) {
              acc.currContinuationToken = newTokens[0];
              controller$.next(newTokens[0]);
            } else {
              // Signal end of processing
              acc.currContinuationToken = 'END';
              controller$.next('END');
            }
            return acc;
          }, {
            currContinuationToken: undefined,
            totalProcessedCount: 0,
          }),
        catchError(async err => {
          this.logger.error({
            message: 'Failed to sink tokens for flow "all".',
            errorDetails: err,
          });
          return err;
        }),
      ).toPromise();

    this.logger.debug({
      message: 'Finished enqueuing notifications for flow SELECTED.',
      data: processingResult,
    });
  }

  private async enqueueNotificationsForFlowAllSimple(
    alertNotification: AlertNotification,
  ): Promise<void> {

    let listResponse: ListTokenAllResponse;
    let currContinuationToken: string;

    while (currContinuationToken || !listResponse) {
      listResponse = await this.allTokenAdapter.getTokens(
        alertNotification.provider,
        alertNotification.platform,
        alertNotification.severity,
        currContinuationToken,
      );

      this.logger.debug({ message: 'S3 List Response', data: listResponse });
      const chunks = sliceIntoChunks(listResponse.results, 10);
      this.logger.debug({ message: 'Chunks', data: chunks });
      const promisesSink = chunks.map(batchItems => this.sinkAdapter.sinkBatch(
        alertNotification,
        batchItems,
        'all',
      ));
      const promisesResult = await Promise.all(promisesSink);
      this.logger.debug({ message: 'Promises Result', data: promisesResult });
      currContinuationToken = listResponse.continuationToken;
    }
  }

  private async enqueueNotificationsForFlowSelected(
    alertNotification: AlertNotification,
  ): Promise<void> {
    // Start with an offset of zero
    const controller$ = new BehaviorSubject<number>(0);
    const processingResult = await controller$
      .pipe(
        mergeMap(
          async (currOffset) => {
            this.logger.debug({
              message: 'Querying tokens from database...',
              data: {
                currOffset,
              },
            });

            const tokensListResponse = await this.selectedTokenAdapter.getTokens(
              alertNotification.provider,
              alertNotification.platform,
              alertNotification.severity,
              currOffset,
              this.selectedRetrievalSize,
              alertNotification.regionKeys,
            );

            this.logger.debug({
              message: 'Queried tokens from database.',
              data: {
                currOffset,
                tokensListResponse,
              },
            });

            return tokensListResponse.results;
          },
          1,
        ),
        // Flatten the array of tokens and complete the controller
        mergeMap(tokens => {
          if (tokens.length === 0) {
            this.logger.debug({
              message: 'No more tokens to process...',
            });
            controller$.complete();
          }
          return from(tokens);
        }),
        // Buffer tokens
        bufferTime(25000, undefined, this.selectedTokensPerMessage),
        // Stop processing if the buffer was reached and we don't have any tokens left
        mergeMap(tokens => {
          return tokens.length > 0 ? of(tokens) : EMPTY;
        }),
        // Allow sink calls to scale out to the configured concurrency
        mergeMap(
          async tokens => {
            this.logger.debug({
              message: 'Sinking tokens to downstream services...',
            });
            await this.sinkAdapter.sinkBatch(
              alertNotification,
              tokens,
              'selected',
            );
            return tokens;
          },
          this.selectedSinkConcurrency,
        ),
        // Accumulate the results
        scan(
          (acc: any, tokens) => {

            this.logger.debug({
              message: 'Accumulating results...',
              data: {
                acc,
                tokens,
              },
            });

            if (tokens.length > 0) {
              acc.totalProcessedCount += tokens.length;
              let queueSize = acc.curOffset - acc.totalProcessedCount;
              while (queueSize + this.selectedRetrievalSize <= this.selectedPipeSize) {
                queueSize += this.selectedRetrievalSize;
                acc.curOffset += this.selectedRetrievalSize;
                controller$.next(acc.curOffset);
              }
            }

            this.logger.debug({
              message: 'Accumulated results.',
              data: acc,

            });
            return acc;
          },
          {
            curOffset: 0,
            totalProcessedCount: 0,
          },
        ),
        catchError(async err => {
          this.logger.error({
            message: 'Failed to sink tokens for flow "selected".',
            errorDetails: err,
          });
          return err;
        }),
      ).toPromise();

    this.logger.debug({
      message: 'Finished enqueuing notifications for flow SELECTED.',
      data: processingResult,
    });
  }

  private async enqueueNotificationsForFlowSelectedSimple(
    alertNotification: AlertNotification,
  ): Promise<void> {
    let currOffset = 0;
    let lastResultCount = 0;

    while (currOffset === 0 || lastResultCount === this.selectedRetrievalSize) {
      this.logger.debug({
        message: 'Querying tokens from database...',
        data: {
          currOffset,
        },
      });

      const tokensListResponse = await this.selectedTokenAdapter.getTokens(
        alertNotification.provider,
        alertNotification.platform,
        alertNotification.severity,
        currOffset,
        this.selectedRetrievalSize,
        alertNotification.regionKeys,
      );

      this.logger.debug({
        message: 'Queried tokens from database.',
        data: {
          currOffset,
          tokensListResponse,
        },
      });

      lastResultCount = tokensListResponse.results.length;
      const chunked = sliceIntoChunks(tokensListResponse.results, this.selectedTokensPerMessage);

      const sinkPromises = chunked.map(tokens => this.sinkAdapter.sinkBatch(
        alertNotification,
        tokens,
        'selected',
      ));

      await Promise.all(sinkPromises);
      currOffset += this.selectedRetrievalSize;
    }

  }
}
