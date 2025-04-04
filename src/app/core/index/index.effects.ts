import { Injectable } from '@angular/core';
import {
  Actions,
  createEffect,
  ofType,
} from '@ngrx/effects';
import {
  select,
  Store,
} from '@ngrx/store';
import {
  filter,
  map,
  switchMap,
  take,
} from 'rxjs/operators';

import { hasValue } from '../../shared/empty.util';
import { NoOpAction } from '../../shared/ngrx/no-op.action';
import {
  AddToObjectCacheAction,
  ObjectCacheActionTypes,
  RemoveFromObjectCacheAction,
} from '../cache/object-cache.actions';
import { CoreState } from '../core-state.model';
import {
  RequestActionTypes,
  RequestConfigureAction,
  RequestStaleAction,
} from '../data/request.actions';
import { RestRequestMethod } from '../data/rest-request-method';
import {
  AddToIndexAction,
  RemoveFromIndexByValueAction,
} from './index.actions';
import {
  getUrlWithoutEmbedParams,
  uuidFromHrefSelector,
} from './index.selectors';
import { IndexName } from './index-name.model';

@Injectable()
export class UUIDIndexEffects {

  addObject$ = createEffect(() => this.actions$
    .pipe(
      ofType(ObjectCacheActionTypes.ADD),
      filter((action: AddToObjectCacheAction) => hasValue(action.payload.objectToCache) && hasValue(action.payload.objectToCache.uuid)),
      map((action: AddToObjectCacheAction) => {
        return new AddToIndexAction(
          IndexName.OBJECT,
          action.payload.objectToCache.uuid,
          action.payload.objectToCache._links.self.href,
        );
      }),
    ));

  /**
   * Adds an alternative link to an object to the ALTERNATIVE_OBJECT_LINK index
   * When the self link of the objectToCache is not the same as the alternativeLink
   */
  addAlternativeObjectLink$ = createEffect(() => this.actions$
    .pipe(
      ofType(ObjectCacheActionTypes.ADD),
      map((action: AddToObjectCacheAction) => {
        const alternativeLink = action.payload.alternativeLink;
        const selfLink = hasValue(action.payload.objectToCache?._links?.self) ? action.payload.objectToCache._links.self.href : alternativeLink;
        if (hasValue(alternativeLink) && alternativeLink !== selfLink) {
          return new AddToIndexAction(
            IndexName.ALTERNATIVE_OBJECT_LINK,
            alternativeLink,
            selfLink,
          );
        } else {
          return new NoOpAction();
        }
      }),
    ));

  removeObject$ = createEffect(() => this.actions$
    .pipe(
      ofType(ObjectCacheActionTypes.REMOVE),
      map((action: RemoveFromObjectCacheAction) => {
        return new RemoveFromIndexByValueAction(
          IndexName.OBJECT,
          action.payload,
        );
      }),
    ));

  addRequest$ = createEffect(() => this.actions$
    .pipe(
      ofType(RequestActionTypes.CONFIGURE),
      filter((action: RequestConfigureAction) => action.payload.method === RestRequestMethod.GET),
      switchMap((action: RequestConfigureAction) => {
        const href = getUrlWithoutEmbedParams(action.payload.href);
        return this.store.pipe(
          select(uuidFromHrefSelector(href)),
          take(1),
          map((uuid: string) => [action, uuid]),
        );
      },
      ),
      switchMap(([action, uuid]: [RequestConfigureAction, string]) => {
        let actions = [];
        if (hasValue(uuid)) {
          actions = [new RequestStaleAction(uuid)];
        }
        actions = [...actions, new AddToIndexAction(
          IndexName.REQUEST,
          getUrlWithoutEmbedParams(action.payload.href),
          action.payload.uuid,
        )];
        return actions;
      }),
    ));

  constructor(private actions$: Actions, private store: Store<CoreState>) {

  }

}
