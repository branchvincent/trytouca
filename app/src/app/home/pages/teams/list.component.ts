/**
 * Copyright 2018-2020 Pejman Ghorbanzade. All rights reserved.
 */

import { Component, HostListener, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TeamsPageService } from './teams.service';
import { ApiService } from 'src/app/core/services';
import { FilterInput } from 'src/app/home/models/filter.model';
import { ConfirmComponent, ConfirmElements } from 'src/app/home/components/confirm.component';
import { PageListComponent } from 'src/app/home/components/page-list.component';
import { TeamsPageTeam, TeamsPageItemType } from './teams.model';

const filterInput: FilterInput<TeamsPageTeam> = {
  filters: [
    {
      key: 'none',
      name: 'None',
      func: (a) => true,
    }
  ],
  sorters: [
    {
      key: 'name',
      name: 'Name',
      func: (a, b) => {
        if (a.type !== b.type) {
          return b.type < a.type ? 1 : -1;
        }
        return -b.data.name.localeCompare(a.data.name);
      }
    }
  ],
  searchBy: ['name', 'slug'],
  defaults: {
    filter: 'none',
    search: '',
    sorter: 'name',
    order: 'asc',
    pagen: 1,
    pagel: 100
  },
  queryKeys: {
    filter: 'f',
    search: 'q',
    sorter: 's',
    order: 'o',
    pagen: 'n',
    pagel: 'l'
  },
  placeholder: 'Find a team'
};

@Component({
  selector: 'app-teams-tab-teams',
  templateUrl: './list.component.html',
  styleUrls: [ './list.component.scss' ]
})
export class TeamsTabTeamsComponent extends PageListComponent<TeamsPageTeam> implements OnDestroy {

  ItemType = TeamsPageItemType;
  counters: Record<TeamsPageItemType, number> = { active: 0, invited: 0, joining: 0 };
  private _confirmModalRef: NgbModalRef;

  /**
   *
   */
  constructor(
    private apiService: ApiService,
    private teamsPageService: TeamsPageService,
    private modalService: NgbModal,
    route: ActivatedRoute,
    router: Router
  ) {
    super(filterInput, Object.values(TeamsPageItemType), route, router);
    this._subAllItems = this.teamsPageService.items$.subscribe(allItems => {
      this.initCollections(allItems);
      this.counters = {
        active: this.countShownRows(TeamsPageItemType.Active),
        invited: this.countShownRows(TeamsPageItemType.Invited),
        joining: this.countShownRows(TeamsPageItemType.Joining)
      };
    });
  }

  /**
   *
   */
  ngOnDestroy() {
    super.ngOnDestroy();
  }

  /**
   *
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // pressing keys 'j' and 'k' should navigate
    // through items on the list
    if (['j', 'k'].includes(event.key)) {
      super.keyboardNavigateList(event, '#wsl-teams-tab-teams');
      return;
    }
    const row = this.selectedRow;
    // pressing 'escape' when an item is selected should unselect it
    if ('Escape' === event.key && row !== -1) {
      this.selectedRow = -1;
    }
    // pressing 'enter' when an item is selected should route to the next page
    if ('Enter' === event.key && row !== -1) {
      this.router.navigate([ '~', this._items[row].data.slug ], { queryParams: {} });
    }
  }

  /**
   *
   */
  confirmDecline(item: TeamsPageTeam): void {
    const elements: ConfirmElements = {
      title: 'Decline Team Invitation',
      message: `<p>Are you sure you want to decline the invitation to join team <em>${item.data.name}</em>?</p>`,
      button: 'Decline Invitation'
    };
    this.showConfirmation(elements, () => this.decline(item));
  }

  /**
   *
   */
  confirmRescind(item: TeamsPageTeam): void {
    const elements: ConfirmElements = {
      title: 'Rescind Join Request',
      message: `<p>Are you sure you want to cancel your request to join team <em>${item.data.name}</em>'s invitation?</p>`,
      button: 'Rescind Request'
    };
    this.showConfirmation(elements, () => this.rescind(item));
  }

  /**
   *
   */
  private showConfirmation(elements: ConfirmElements, func: () => void) {
    this._confirmModalRef = this.modalService.open(ConfirmComponent);
    this._confirmModalRef.componentInstance.elements = elements;
    this._confirmModalRef.result
      .then((state: boolean) => {
        if (!state) {
          return;
        }
        func();
      })
      .catch(_e => true);
  }

  /**
   *
   */
  accept(item: TeamsPageTeam) {
    const url = [ 'team', item.data.slug, 'invite', 'accept' ].join('/');
    this.apiService.post(url).subscribe(() => {
      this.teamsPageService.refreshList();
    });
  }

  /**
   *
   */
  private decline(item: TeamsPageTeam) {
    const url = [ 'team', item.data.slug, 'invite', 'decline' ].join('/');
    this.apiService.post(url).subscribe(() => {
      this.teamsPageService.refreshList();
    });
  }

  /**
   *
   */
  private rescind(item: TeamsPageTeam) {
    const url = [ 'team', item.data.slug, 'join' ].join('/');
    this.apiService.delete(url).subscribe(() => {
      this.teamsPageService.refreshList();
    });
  }

}
