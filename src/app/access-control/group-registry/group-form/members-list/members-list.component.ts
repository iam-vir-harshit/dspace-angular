import {
  AsyncPipe,
  NgClass,
} from '@angular/common';
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  ReactiveFormsModule,
  UntypedFormBuilder,
} from '@angular/forms';
import {
  Router,
  RouterLink,
} from '@angular/router';
import {
  TranslateModule,
  TranslateService,
} from '@ngx-translate/core';
import {
  BehaviorSubject,
  combineLatest as observableCombineLatest,
  Observable,
  ObservedValueOf,
  of,
  Subscription,
} from 'rxjs';
import {
  defaultIfEmpty,
  map,
  switchMap,
  take,
} from 'rxjs/operators';

import { DSONameService } from '../../../../core/breadcrumbs/dso-name.service';
import {
  buildPaginatedList,
  PaginatedList,
} from '../../../../core/data/paginated-list.model';
import { RemoteData } from '../../../../core/data/remote-data';
import { EPersonDataService } from '../../../../core/eperson/eperson-data.service';
import { GroupDataService } from '../../../../core/eperson/group-data.service';
import { EPerson } from '../../../../core/eperson/models/eperson.model';
import { EpersonDtoModel } from '../../../../core/eperson/models/eperson-dto.model';
import { Group } from '../../../../core/eperson/models/group.model';
import { PaginationService } from '../../../../core/pagination/pagination.service';
import {
  getAllCompletedRemoteData,
  getFirstCompletedRemoteData,
  getRemoteDataPayload,
} from '../../../../core/shared/operators';
import { BtnDisabledDirective } from '../../../../shared/btn-disabled.directive';
import { ContextHelpDirective } from '../../../../shared/context-help.directive';
import { NotificationsService } from '../../../../shared/notifications/notifications.service';
import { PaginationComponent } from '../../../../shared/pagination/pagination.component';
import { PaginationComponentOptions } from '../../../../shared/pagination/pagination-component-options.model';
import { getEPersonEditRoute } from '../../../access-control-routing-paths';

// todo: optimize imports

/**
 * Keys to keep track of specific subscriptions
 */
enum SubKey {
  ActiveGroup,
  Members,
  SearchResults,
}

/**
 * The layout config of the buttons in the last column
 */
export interface EPersonActionConfig {
  /**
   * The css classes that should be added to the button
   */
  css?: string;
  /**
   * Whether the button should be disabled
   */
  disabled: boolean;
  /**
   * The Font Awesome icon that should be used
   */
  icon: string;
}

/**
 * The {@link EPersonActionConfig} that should be used to display the button. The remove config will be used when the
 * {@link EPerson} is already a member of the {@link Group} and the remove config will be used otherwise.
 *
 * *See {@link actionConfig} for an example*
 */
export interface EPersonListActionConfig {
  add: EPersonActionConfig;
  remove: EPersonActionConfig;
}

@Component({
  selector: 'ds-members-list',
  templateUrl: './members-list.component.html',
  imports: [
    AsyncPipe,
    BtnDisabledDirective,
    ContextHelpDirective,
    NgClass,
    PaginationComponent,
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
  ],
  standalone: true,
})
/**
 * The list of members in the edit group page
 */
export class MembersListComponent implements OnInit, OnDestroy {

  @Input()
  messagePrefix: string;

  @Input()
  actionConfig: EPersonListActionConfig = {
    add: {
      css: 'btn-outline-primary',
      disabled: false,
      icon: 'fas fa-plus fa-fw',
    },
    remove: {
      css: 'btn-outline-danger',
      disabled: false,
      icon: 'fas fa-trash-alt fa-fw',
    },
  };

  /**
   * EPeople being displayed in search result, initially all members, after search result of search
   */
  ePeopleSearch: BehaviorSubject<PaginatedList<EPerson>> = new BehaviorSubject<PaginatedList<EPerson>>(undefined);
  /**
   * List of EPeople members of currently active group being edited
   */
  ePeopleMembersOfGroup: BehaviorSubject<PaginatedList<EpersonDtoModel>> = new BehaviorSubject(undefined);

  /**
   * Pagination config used to display the list of EPeople that are result of EPeople search
   */
  configSearch: PaginationComponentOptions = Object.assign(new PaginationComponentOptions(), {
    id: 'sml',
    pageSize: 5,
    currentPage: 1,
  });
  /**
   * Pagination config used to display the list of EPerson Membes of active group being edited
   */
  config: PaginationComponentOptions = Object.assign(new PaginationComponentOptions(), {
    id: 'ml',
    pageSize: 5,
    currentPage: 1,
  });

  /**
   * Map of active subscriptions
   */
  subs: Map<SubKey, Subscription> = new Map();

  // The search form
  searchForm;

  // The current member search form
  searchCurrentMembersForm;

  // Current search in edit group - epeople search form
  currentSearchQuery: string;

  // Current search in edit group - epeople current members search form
  currentMembersSearchQuery: string;

  // Whether or not user has done a EPeople search yet
  searchDone: boolean;

  // Whether or not user has done a EPeople Member search yet
  searchCurrentMembersDone: boolean;

  // current active group being edited
  groupBeingEdited: Group;

  readonly getEPersonEditRoute = getEPersonEditRoute;

  constructor(
    protected groupDataService: GroupDataService,
    public ePersonDataService: EPersonDataService,
    protected translateService: TranslateService,
    protected notificationsService: NotificationsService,
    protected formBuilder: UntypedFormBuilder,
    protected paginationService: PaginationService,
    protected router: Router,
    public dsoNameService: DSONameService,
  ) {
    this.currentSearchQuery = '';
    this.currentMembersSearchQuery = '';
  }

  ngOnInit(): void {
    this.searchForm = this.formBuilder.group(({
      query: '',
    }));

    this.searchCurrentMembersForm = this.formBuilder.group(({
      queryCurrentMembers: '',
    }));

    this.subs.set(SubKey.ActiveGroup, this.groupDataService.getActiveGroup().subscribe((activeGroup: Group) => {
      if (activeGroup != null) {
        this.groupBeingEdited = activeGroup;
        this.retrieveMembers(this.config.currentPage);
        this.search({ query: '' });
      }
    }));
  }

  /**
   * Retrieve the EPersons that are members of the group
   *
   * @param page the number of the page to retrieve
   * @private
   */
  retrieveMembers(page: number): void {
    this.unsubFrom(SubKey.Members);
    this.subs.set(SubKey.Members,
      this.paginationService.getCurrentPagination(this.config.id, this.config).pipe(
        switchMap((currentPagination) => {
          return this.ePersonDataService.findListByHref(this.groupBeingEdited._links.epersons.href, {
            currentPage: currentPagination.currentPage,
            elementsPerPage: currentPagination.pageSize,
          },
          );
        }),
        getAllCompletedRemoteData(),
        map((rd: RemoteData<any>) => {
          if (rd.hasFailed) {
            this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure', { cause: rd.errorMessage }));
          } else {
            return rd;
          }
        }),
        switchMap((epersonListRD: RemoteData<PaginatedList<EPerson>>) => {
          const dtos$ = observableCombineLatest([...epersonListRD.payload.page.map((member: EPerson) => {
            const dto$: Observable<EpersonDtoModel> = observableCombineLatest(
              this.isMemberOfGroup(member), (isMember: ObservedValueOf<Observable<boolean>>) => {
                const epersonDtoModel: EpersonDtoModel = new EpersonDtoModel();
                epersonDtoModel.eperson = member;
                epersonDtoModel.ableToDelete = isMember;
                return epersonDtoModel;
              });
            return dto$;
          })]);
          return dtos$.pipe(defaultIfEmpty([]), map((dtos: EpersonDtoModel[]) => {
            return buildPaginatedList(epersonListRD.payload.pageInfo, dtos);
          }));
        }),
      ).subscribe((paginatedListOfDTOs: PaginatedList<EpersonDtoModel>) => {
        this.ePeopleMembersOfGroup.next(paginatedListOfDTOs);
      }),
    );
  }

  /**
   * We always return true since this is only used by the top section (which represents all the users part of the group
   * in {@link MembersListComponent})
   *
   * @param possibleMember  EPerson that is a possible member (being tested) of the group currently being edited
   */
  isMemberOfGroup(possibleMember: EPerson): Observable<boolean> {
    return of(true);
  }

  /**
   * Unsubscribe from a subscription if it's still subscribed, and remove it from the map of
   * active subscriptions
   *
   * @param key The key of the subscription to unsubscribe from
   * @private
   */
  protected unsubFrom(key: SubKey) {
    if (this.subs.has(key)) {
      this.subs.get(key).unsubscribe();
      this.subs.delete(key);
    }
  }

  /**
   * Deletes a given EPerson from the members list of the group currently being edited
   * @param eperson   EPerson we want to delete as member from group that is currently being edited
   */
  deleteMemberFromGroup(eperson: EPerson) {
    this.groupDataService.getActiveGroup().pipe(take(1)).subscribe((activeGroup: Group) => {
      if (activeGroup != null) {
        const response = this.groupDataService.deleteMemberFromGroup(activeGroup, eperson);
        this.showNotifications('deleteMember', response, this.dsoNameService.getName(eperson), activeGroup);
        // Reload search results (if there is an active query).
        // This will potentially add this deleted subgroup into the list of search results.
        if (this.currentSearchQuery != null) {
          this.search({ query: this.currentSearchQuery });
        }
      } else {
        this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure.noActiveGroup'));
      }
    });
  }

  /**
   * Adds a given EPerson to the members list of the group currently being edited
   * @param eperson   EPerson we want to add as member to group that is currently being edited
   */
  addMemberToGroup(eperson: EPerson) {
    this.groupDataService.getActiveGroup().pipe(take(1)).subscribe((activeGroup: Group) => {
      if (activeGroup != null) {
        const response = this.groupDataService.addMemberToGroup(activeGroup, eperson);
        this.showNotifications('addMember', response, this.dsoNameService.getName(eperson), activeGroup);
        // Reload search results (if there is an active query).
        // This will potentially add this deleted subgroup into the list of search results.
        if (this.currentSearchQuery != null) {
          this.search({ query: this.currentSearchQuery });
        }
      } else {
        this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure.noActiveGroup'));
      }
    });
  }

  /**
   * Search all EPeople who are NOT a member of the current group by name, email or metadata
   * @param data  Contains query param
   */
  search(data: any) {
    this.unsubFrom(SubKey.SearchResults);
    this.subs.set(SubKey.SearchResults,
      this.paginationService.getCurrentPagination(this.configSearch.id, this.configSearch).pipe(
        switchMap((paginationOptions) => {
          const query: string = data.query;
          if (query != null && this.currentSearchQuery !== query && this.groupBeingEdited) {
            this.currentSearchQuery = query;
            this.paginationService.resetPage(this.configSearch.id);
          }
          this.searchDone = true;

          return this.ePersonDataService.searchNonMembers(this.currentSearchQuery, this.groupBeingEdited.id, {
            currentPage: paginationOptions.currentPage,
            elementsPerPage: paginationOptions.pageSize,
          }, false, true);
        }),
        getAllCompletedRemoteData(),
        map((rd: RemoteData<any>) => {
          if (rd.hasFailed) {
            this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure', { cause: rd.errorMessage }));
          } else {
            return rd;
          }
        }),
        getRemoteDataPayload())
        .subscribe((paginatedListOfEPersons: PaginatedList<EPerson>) => {
          this.ePeopleSearch.next(paginatedListOfEPersons);
        }));
  }

  /**
  * Search all EPeople who are a member of the current group by name, email or metadata
  * @param data  Contains query param
  */
  searchMembers(data: any) {
    this.unsubFrom(SubKey.Members);
    this.subs.set(SubKey.Members,
      this.paginationService.getCurrentPagination(this.config.id, this.config).pipe(
        switchMap((paginationOptions) => {
          const query: string = data.queryCurrentMembers;
          if (query != null && this.currentMembersSearchQuery !== query && this.groupBeingEdited) {
            this.currentMembersSearchQuery = query;
            this.paginationService.resetPage(this.config.id);
          }
          this.searchCurrentMembersDone = true;

          return this.ePersonDataService.searchMembers(this.currentMembersSearchQuery, this.groupBeingEdited.id, {
            currentPage: paginationOptions.currentPage,
            elementsPerPage: paginationOptions.pageSize,
          }, false, true);
        }),
        getAllCompletedRemoteData(),
        map((rd: RemoteData<any>) => {
          if (rd.hasFailed) {
            this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure', { cause: rd.errorMessage }));
          } else {
            return rd;
          }
        }),
        switchMap((epersonListRD: RemoteData<PaginatedList<EPerson>>) => {
          if (!epersonListRD || !epersonListRD.payload || !epersonListRD.payload.page) {
            return of(buildPaginatedList(undefined, []));
          } // added null check
          const dtos$ = observableCombineLatest([...epersonListRD.payload.page.map((member: EPerson) => {
            const dto$: Observable<EpersonDtoModel> = observableCombineLatest(
              this.isMemberOfGroup(member), (isMember: ObservedValueOf<Observable<boolean>>) => {
                const epersonDtoModel: EpersonDtoModel = new EpersonDtoModel();
                epersonDtoModel.eperson = member;
                epersonDtoModel.ableToDelete = isMember;
                return epersonDtoModel;
              });
            return dto$;
          })]);
          return dtos$.pipe(defaultIfEmpty([]), map((dtos: EpersonDtoModel[]) => {
            return buildPaginatedList(epersonListRD.payload.pageInfo, dtos);
          }));
        }),
      ).subscribe((paginatedListOfDTOs: PaginatedList<EpersonDtoModel>) => {
        this.ePeopleMembersOfGroup.next(paginatedListOfDTOs);
      }));
  }

  /**
   * unsub all subscriptions
   */
  ngOnDestroy(): void {
    for (const key of this.subs.keys()) {
      this.unsubFrom(key);
    }
    this.paginationService.clearPagination(this.config.id);
    this.paginationService.clearPagination(this.configSearch.id);
  }

  /**
   * Shows a notification based on the success/failure of the request
   * @param messageSuffix   Suffix for message
   * @param response        RestResponse observable containing success/failure request
   * @param nameObject      Object request was about
   * @param activeGroup     Group currently being edited
   */
  showNotifications(messageSuffix: string, response: Observable<RemoteData<any>>, nameObject: string, activeGroup: Group) {
    response.pipe(getFirstCompletedRemoteData()).subscribe((rd: RemoteData<any>) => {
      if (rd.hasSucceeded) {
        this.notificationsService.success(this.translateService.get(this.messagePrefix + '.notification.success.' + messageSuffix, { name: nameObject }));
      } else {
        this.notificationsService.error(this.translateService.get(this.messagePrefix + '.notification.failure.' + messageSuffix, { name: nameObject }));
      }
    });
  }

  /**
   * Reset all input-fields to be empty and search all search
   */
  clearFormAndResetResult() {
    this.searchForm.patchValue({
      query: '',
    });
    this.search({ query: '' });
  }

  /**
  * Reset all input-fields to be empty and search all search
  */
  clearCurrentMembersFormAndResetResult() {
    this.searchCurrentMembersForm.patchValue({
      queryCurrentMembers:'',
    });
    this.searchMembers({ queryCurrentMembers: '' });
  }
}
