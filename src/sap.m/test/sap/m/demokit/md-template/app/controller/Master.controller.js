/*!
 * ${copyright}
 */

sap.ui.define([
		"sap/ui/demo/mdtemplate/controller/BaseController",
		"sap/ui/model/json/JSONModel",
		"sap/ui/model/Filter",
		"sap/ui/model/FilterOperator",
		"sap/ui/model/Sorter",
		"sap/m/GroupHeaderListItem",
		"sap/ui/Device",
		"sap/ui/demo/mdtemplate/model/grouper"
	], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, GroupHeaderListItem, Device, grouper) {
	"use strict";

	return BaseController.extend("sap.ui.demo.mdtemplate.controller.Master", {

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {
			var oListSelector = this.getOwnerComponent().oListSelector;

			this._oList = this.byId("list");
			this._oPullToRefresh = this.byId("pullToRefresh");
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter : [],
				aSearch : []
			};
			// keeps the group and sort state
			this._oListSorterState = {
				aGroup : [],
				aSort : []
			};

			// Control state model
			this._oViewModel = new JSONModel({
				isFilterBarVisible : false,
				filterBarLabel : "",
				masterListTitle : this.getResourceBundle().getText("masterTitle"),
				masterListNoDataText : this.getResourceBundle().getText("masterListNoDataText")
			});
			this.setModel(this._oViewModel, "view");

			// instead of relying on the master list's automatic busy indication
			// we attach to the dataRequested and dataReceived events on the list
			// binding to set the content of the master page busy. Otherwise only
			// the list is busy while loading the data. Additionally, we set the
			// delay to 0 to set the view busy initially and reset it to the
			// default after the first data was loaded.
			this.getRouter().getTargets().getTarget("master").attachEventOnce("display", function () {
				this.getView().setBusyIndicatorDelay(0);
				this._oList.getBinding("items").attachDataRequested(function () {
					this.getView().setBusy(true);
				}.bind(this));
				this._oList.getBinding("items").attachDataReceived(function () {
					this.getView().setBusy(false);
					this.getView().setBusyIndicatorDelay(null);
				}.bind(this));
			}.bind(this));


			oListSelector.setBoundMasterList(this._oList);

			// if the master route was hit (empty hash) we have to set
			// the hash to to the first item in the list as soon as the
			// listLoading is done and the first item in the list is known
			this.getRouter().getRoute("master").attachPatternMatched( function() {
				oListSelector.oWhenListLoadingIsDone.then(
					function () {
						if (this._oList.getMode() !== "None") {
								var sObjectId = this._oList.getItems()[0].getBindingContext().getProperty("ObjectID");
								this.getRouter().navTo("object", {objectId : sObjectId}, true);
						}
					}.bind(this)
				);
			}, this);

			this.getRouter().attachBypassed(this.onBypassed, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter and hides the pull to refresh control, if
		 * necessary.
		 *
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
			// hide pull to refresh if necessary
			this._oPullToRefresh.hide();
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 *
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch : function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}


			var sQuery = oEvent.getParameter("query");

			if (sQuery && sQuery.length > 0) {
				this._oListFilterState.aSearch = [new Filter("Name", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 *
		 * @public
		 */
		onRefresh : function () {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the sorter selection.
		 * @param {sap.ui.base.Event} oEvent the select event
		 * @public
		 */
		onSort : function (oEvent) {
			var sPath = oEvent.getParameter("selectedItem").getKey();

			this._oListSorterState.aSort = new Sorter(sPath, false);
			this._applyGroupSort();
		},


		/**
		 * Event handler for the grouper selection.
		 * @param {sap.ui.base.Event} oEvent the search field event
		 * @public
		 */
		onGroup : function (oEvent) {
			var sKey = oEvent.getParameter("selectedItem").getKey(),
				// TODO: make this better!
				oGroups = {
					Group1 : "UnitNumber",
					Group2 : "Name"
				};

			if (sKey !== "None") {
				this._oListSorterState.aGroup = [new Sorter(oGroups[sKey], false,
						grouper[sKey].bind(oEvent.getSource()))];
			} else {
				this._oListSorterState.aGroup = [];
			}
			this._applyGroupSort();
		},


		/**
		 * Event handler for the filter button to open the ViewSettingsDialog.
		 * which is used to add or remove filters to the master list. This
		 * handler method is also called when the filter bar is pressed,
		 * which is added to the beginning of the master list when a filter is applied.
		 *
		 * @public
		 */
		onOpenViewSettings : function () {
			if (!this.oViewSettingsDialog) {
				this.oViewSettingsDialog = sap.ui.xmlfragment("sap.ui.demo.mdtemplate.view.ViewSettingsDialog" , this);
				this.getView().addDependent(this.oViewSettingsDialog);
				// forward compact/cozy style into Dialog
				jQuery.sap.syncStyleClass(this.getOwnerComponent().getCompactCozyClass(), this.getView(), this.oViewSettingsDialog);
			}
			this.oViewSettingsDialog.open();
		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters
		 * are applied to the master list, which can also mean that the currently
		 * applied filters are removed from the master list, in case the filter
		 * settings are removed in the ViewSettingsDialog.
		 *
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog : function (oEvent) {
			var aFilterItems = oEvent.getParameters().filterItems,
				aFilters = [],
				aCaptions = [];

			// update filter state:
			// combine the filter array and the filter string
			aFilterItems.forEach(function (oItem) {
				switch (oItem.getKey()) {
					case "Filter1":
						aFilters.push(new Filter("UnitNumber", FilterOperator.LE, 100));
						break;
					case "Filter2":
						aFilters.push(new Filter("UnitNumber", FilterOperator.GT, 100));
						break;
					default:
						break;
				}
				aCaptions.push(oItem.getText());
			});
			this._oListFilterState.aFilter = aFilters;

			this._updateFilterBar(aCaptions.join(", "));
			this._applyFilterSearch();
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelect : function (oEvent) {
			// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
			this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 *
		 * @public
		 */
		onBypassed : function () {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 *
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem( {
				title: oGroup.text,
				upperCase: false
			});
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail : function (oItem) {
			var bReplace = !Device.system.phone;
			this.getRouter().navTo("object", {
				objectId: oItem.getBindingContext().getProperty("ObjectID")
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount : function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal() && iTotalItems) {
				sTitle = this.getResourceBundle().getText("masterTitleCount", [iTotalItems]);
			} else {
				//Display 'Objects' instead of 'Objects (0)'
				sTitle = this.getResourceBundle().getText("masterTitle");
			}
			this._oViewModel.setProperty("/masterListTitle", sTitle);
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch : function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter);
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				this._oViewModel.setProperty("/masterListNoDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				this._oViewModel.setProperty("/masterListNoDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method to apply both group and sort state together on the list binding
		 * @private
		 */
		_applyGroupSort : function () {
			var aSorters = this._oListSorterState.aGroup.concat(this._oListSorterState.aSort);
			this._oList.getBinding("items").sort(aSorters);
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {sValue} sValue the selected filter value
		 * @private
		 */
		_updateFilterBar : function (sValue) {
			this._oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
			this._oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sValue]));
		}
	});

}, /* bExport= */ true);
