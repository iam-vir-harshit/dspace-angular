import { CommonModule } from '@angular/common';
import {
  DebugElement,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  flush,
  inject,
  TestBed,
  tick,
  waitForAsync,
} from '@angular/core/testing';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  BrowserModule,
  By,
} from '@angular/platform-browser';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import {
  TranslateLoader,
  TranslateModule,
  TranslateService,
} from '@ngx-translate/core';
import {
  Observable,
  of,
} from 'rxjs';
import { mockGroup } from 'src/app/shared/mocks/submission.mock';

import { DSONameService } from '../../../../core/breadcrumbs/dso-name.service';
import { RestResponse } from '../../../../core/cache/response.models';
import {
  buildPaginatedList,
  PaginatedList,
} from '../../../../core/data/paginated-list.model';
import { RemoteData } from '../../../../core/data/remote-data';
import { EPersonDataService } from '../../../../core/eperson/eperson-data.service';
import { GroupDataService } from '../../../../core/eperson/group-data.service';
import { EPerson } from '../../../../core/eperson/models/eperson.model';
import { Group } from '../../../../core/eperson/models/group.model';
import { PaginationService } from '../../../../core/pagination/pagination.service';
import { PageInfo } from '../../../../core/shared/page-info.model';
import { ContextHelpDirective } from '../../../../shared/context-help.directive';
import { FormBuilderService } from '../../../../shared/form/builder/form-builder.service';
import { DSONameServiceMock } from '../../../../shared/mocks/dso-name.service.mock';
import { getMockFormBuilderService } from '../../../../shared/mocks/form-builder-service.mock';
import { RouterMock } from '../../../../shared/mocks/router.mock';
import { getMockTranslateService } from '../../../../shared/mocks/translate.service.mock';
import { NotificationsService } from '../../../../shared/notifications/notifications.service';
import { PaginationComponent } from '../../../../shared/pagination/pagination.component';
import {
  createFailedRemoteDataObject$,
  createSuccessfulRemoteDataObject$,
} from '../../../../shared/remote-data.utils';
import { ActivatedRouteStub } from '../../../../shared/testing/active-router.stub';
import {
  EPersonMock,
  EPersonMock2,
} from '../../../../shared/testing/eperson.mock';
import { GroupMock } from '../../../../shared/testing/group-mock';
import { NotificationsServiceStub } from '../../../../shared/testing/notifications-service.stub';
import { PaginationServiceStub } from '../../../../shared/testing/pagination-service.stub';
import { TranslateLoaderMock } from '../../../../shared/testing/translate-loader.mock';
import { MembersListComponent } from './members-list.component';

// todo: optimize imports

describe('MembersListComponent', () => {
  let component: MembersListComponent;
  let fixture: ComponentFixture<MembersListComponent>;
  let translateService: TranslateService;
  let builderService: FormBuilderService;
  let ePersonDataServiceStub: any;
  let groupsDataServiceStub: any;
  let activeGroup;
  let epersonMembers: EPerson[];
  let epersonNonMembers: EPerson[];
  let paginationService;

  beforeEach(waitForAsync(() => {
    activeGroup = GroupMock;
    epersonMembers = [EPersonMock2];
    epersonNonMembers = [EPersonMock];
    ePersonDataServiceStub = {
      activeGroup: activeGroup,
      epersonMembers: epersonMembers,
      epersonNonMembers: epersonNonMembers,
      // This method is used to get all the current members
      findListByHref(_href: string): Observable<RemoteData<PaginatedList<EPerson>>> {
        return createSuccessfulRemoteDataObject$(buildPaginatedList<EPerson>(new PageInfo(), groupsDataServiceStub.getEPersonMembers()));
      },
      // This method is used to search across *non-members*
      searchNonMembers(query: string, group: string): Observable<RemoteData<PaginatedList<EPerson>>> {
        if (query === '') {
          return createSuccessfulRemoteDataObject$(buildPaginatedList(new PageInfo(), epersonNonMembers));
        }
        return createSuccessfulRemoteDataObject$(buildPaginatedList(new PageInfo(), []));
      },
      searchMembers(query: string, groupId: string, pagination, exact: boolean, currentMembers: boolean) {
        return of(createSuccessfulRemoteDataObject$(buildPaginatedList(new PageInfo(), [])));
      },
      clearEPersonRequests() {
        // empty
      },
      clearLinkRequests() {
        // empty
      },
    };
    groupsDataServiceStub = {
      activeGroup: activeGroup,
      epersonMembers: epersonMembers,
      epersonNonMembers: epersonNonMembers,
      getActiveGroup(): Observable<Group> {
        return of(activeGroup);
      },
      getEPersonMembers() {
        return this.epersonMembers;
      },
      addMemberToGroup(parentGroup, epersonToAdd: EPerson): Observable<RestResponse> {
        // Add eperson to list of members
        this.epersonMembers = [...this.epersonMembers, epersonToAdd];
        // Remove eperson from list of non-members
        this.epersonNonMembers.forEach( (eperson: EPerson, index: number) => {
          if (eperson.id === epersonToAdd.id) {
            this.epersonNonMembers.splice(index, 1);
          }
        });
        return of(new RestResponse(true, 200, 'Success'));
      },
      clearGroupsRequests() {
        // empty
      },
      clearGroupLinkRequests() {
        // empty
      },
      getGroupEditPageRouterLink(group: Group): string {
        return '/access-control/groups/' + group.id;
      },
      deleteMemberFromGroup(parentGroup, epersonToDelete: EPerson): Observable<RestResponse> {
        // Remove eperson from list of members
        this.epersonMembers.forEach( (eperson: EPerson, index: number) => {
          if (eperson.id === epersonToDelete.id) {
            this.epersonMembers.splice(index, 1);
          }
        });
        // Add eperson to list of non-members
        this.epersonNonMembers = [...this.epersonNonMembers, epersonToDelete];
        return of(new RestResponse(true, 200, 'Success'));
      },
    };
    builderService = getMockFormBuilderService();
    translateService = getMockTranslateService();

    paginationService = new PaginationServiceStub();
    return TestBed.configureTestingModule({
      imports: [CommonModule, NgbModule, FormsModule, ReactiveFormsModule, BrowserModule,
        TranslateModule.forRoot({
          loader: {
            provide: TranslateLoader,
            useClass: TranslateLoaderMock,
          },
        }), MembersListComponent],
      providers: [MembersListComponent,
        { provide: EPersonDataService, useValue: ePersonDataServiceStub },
        { provide: GroupDataService, useValue: groupsDataServiceStub },
        { provide: NotificationsService, useValue: new NotificationsServiceStub() },
        { provide: FormBuilderService, useValue: builderService },
        { provide: Router, useValue: new RouterMock() },
        { provide: PaginationService, useValue: paginationService },
        { provide: DSONameService, useValue: new DSONameServiceMock() },
        { provide: ActivatedRoute, useValue: new ActivatedRouteStub() },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(MembersListComponent, {
        remove: {
          imports: [PaginationComponent, ContextHelpDirective],
        },
      })
      .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MembersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(fakeAsync(() => {
    fixture.destroy();
    fixture.debugElement.nativeElement.remove();
    flush();
    component = null;
    fixture.debugElement.nativeElement.remove();
  }));

  it('should create MembersListComponent', inject([MembersListComponent], (comp: MembersListComponent) => {
    expect(comp).toBeDefined();
  }));

  describe('current members list', () => {
    it('should show list of eperson members of current active group', () => {
      const epersonIdsFound = fixture.debugElement.queryAll(By.css('#ePeopleMembersOfGroup tr td:first-child'));
      expect(epersonIdsFound.length).toEqual(1);
      epersonMembers.map((eperson: EPerson) => {
        expect(epersonIdsFound.find((foundEl) => {
          return (foundEl.nativeElement.textContent.trim() === eperson.uuid);
        })).toBeTruthy();
      });
    });

    it('should show a delete button next to each member', () => {
      const epersonsFound = fixture.debugElement.queryAll(By.css('#ePeopleMembersOfGroup tbody tr'));
      epersonsFound.map((foundEPersonRowElement: DebugElement) => {
        const addButton: DebugElement = foundEPersonRowElement.query(By.css('td:last-child .fa-plus'));
        const deleteButton: DebugElement = foundEPersonRowElement.query(By.css('td:last-child .fa-trash-alt'));
        expect(addButton).toBeNull();
        expect(deleteButton).not.toBeNull();
      });
    });

    describe('if first delete button is pressed', () => {
      beforeEach(() => {
        spyOn(component, 'search').and.callThrough();
        const deleteButton: DebugElement = fixture.debugElement.query(By.css('#ePeopleMembersOfGroup tbody .fa-trash-alt'));
        deleteButton.nativeElement.click();
        fixture.detectChanges();
      });
      it('should trigger the search to add the user back to the search table', () => {
        expect(component.search).toHaveBeenCalled();
      });
    });
  });

  describe('search', () => {
    describe('when searching without query', () => {
      let epersonsFound: DebugElement[];
      beforeEach(fakeAsync(() => {
        component.search({ scope: 'metadata', query: '' });
        tick();
        fixture.detectChanges();
        epersonsFound = fixture.debugElement.queryAll(By.css('#epersonsSearch tbody tr'));
      }));

      it('should display only non-members of the group', () => {
        const epersonIdsFound = fixture.debugElement.queryAll(By.css('#epersonsSearch tbody tr td:first-child'));
        expect(epersonIdsFound.length).toEqual(1);
        epersonNonMembers.map((eperson: EPerson) => {
          expect(epersonIdsFound.find((foundEl) => {
            return (foundEl.nativeElement.textContent.trim() === eperson.uuid);
          })).toBeTruthy();
        });
      });

      it('should display an add button next to non-members, not a delete button', () => {
        epersonsFound.map((foundEPersonRowElement: DebugElement) => {
          const addButton: DebugElement = foundEPersonRowElement.query(By.css('td:last-child .fa-plus'));
          const deleteButton: DebugElement = foundEPersonRowElement.query(By.css('td:last-child .fa-trash-alt'));
          expect(addButton).not.toBeNull();
          expect(deleteButton).toBeNull();
        });
      });

      describe('if first add button is pressed', () => {
        beforeEach(() => {
          spyOn(component, 'search').and.callThrough();
          const addButton: DebugElement = fixture.debugElement.query(By.css('#epersonsSearch tbody .fa-plus'));
          addButton.nativeElement.click();
          fixture.detectChanges();
        });
        it('should trigger the search to remove the user from the search table', () => {
          expect(component.search).toHaveBeenCalled();
        });
      });
    });
  });

  describe('test for searchMembers', () => {
    let comp: any;

    beforeEach(() => {
      comp = component as any;
      spyOn(comp.ePersonDataService, 'searchMembers');
      spyOn(comp.notificationsService, 'error');
    });

    it('should search members and update ePeopleMembersOfGroup', fakeAsync(() => {
      const fakeGroup = mockGroup;
      const fakeMember = EPersonMock;
      const fakePaginatedList = { pageInfo: { totalPages: 1 }, page: [fakeMember] };
      const fakeResponse = createSuccessfulRemoteDataObject$(fakePaginatedList);

      comp.groupBeingEdited = fakeGroup;
      comp.ePersonDataService.searchMembers.and.returnValue(fakeResponse);

      spyOn(comp, 'isMemberOfGroup').and.returnValue(of(true));
      const groupSpy = spyOn(comp.ePeopleMembersOfGroup, 'next');

      comp.searchMembers({ queryCurrentMembers: 'John' });
      tick();

      expect(comp.ePersonDataService.searchMembers).toHaveBeenCalled();
      expect(groupSpy).toHaveBeenCalled();
    }));

    it('should show error notification when API call fails', fakeAsync(() => {
      const fakeGroup = mockGroup;
      comp.groupBeingEdited = fakeGroup;

      comp.ePersonDataService.searchMembers.and.returnValue(createFailedRemoteDataObject$('Server Error'));

      comp.searchMembers({ queryCurrentMembers: 'John' });
      tick();

      expect(comp.notificationsService.error).toHaveBeenCalled();
    }));

    it('should reset the searchCurrentMembersForm and call searchMembers with empty query', () => {
      comp.searchCurrentMembersForm = new FormGroup({
        queryCurrentMembers: new FormControl('John Doe'),
      });

      const searchSpy = spyOn(comp, 'searchMembers');
      comp.clearCurrentMembersFormAndResetResult();

      expect(comp.searchCurrentMembersForm.value.queryCurrentMembers).toBe('');
      expect(searchSpy).toHaveBeenCalledWith({ queryCurrentMembers: '' });
    });
  });

});
