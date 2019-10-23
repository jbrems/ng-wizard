import { ComponentRef, Injectable } from '@angular/core';
import { Route, Router } from '@angular/router';
import * as utils from './ng-wizard.utils';
import { NoChildRoutes, NoWizardRoute, NoWsInterface } from './ng-wizard-error/ng-wizard.error';
import { NgWizardStepData } from './ng-wizard-step/ng-wizard-step-data.interface';
import { NgWizardStep } from './ng-wizard-step/ng-wizard-step';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NgWizardOptions } from './ng-wizard-options/ng-wizard-options.interface';

@Injectable()
export class NgWizardService {
  public wizardOptions: NgWizardOptions;

  private wizardRoute: Route;
  private stepData: NgWizardStepData[] = [];
  private currentStepData: NgWizardStepData;
  private currentComponent: NgWizardStep;

  private stepDataChanges = new BehaviorSubject<NgWizardStepData[]>([]);

  constructor(private router: Router) {}

  /**
   * Initializes the wizard by parsing the wizard's child routes found in Angular's router config
   * into a list of NgWizardStepData.
   * @param wizardComponentName The name of the wizard component
   */
  public loadWizardRoutes(wizardComponentName: string) {
    this.wizardRoute = this.getWizardRoute(wizardComponentName);
    if (!this.wizardRoute) {
      throw new NoWizardRoute(wizardComponentName);
    }
    this.wizardOptions = utils.mergeWizardOptions(this.wizardRoute.data);
    this.loadChildRoutes(this.wizardRoute);
  }

  /**
   * Checks and stores the currently displayed component.
   * @param componentRef A reference to the currently displayed component
   */
  public registerActiveComponent(componentRef: ComponentRef<any>) {
    if (!utils.componentImplementsNgWizardStepInterface(componentRef)) {
      throw new NoWsInterface(componentRef.constructor.name);
    }

    // Cast to unknown before casting to NgWizardStep to let typescript know we checked and approve
    // this conversion.
    this.currentComponent = (componentRef as unknown) as NgWizardStep;
    this.currentStepData = utils.getStepDataForUrl(this.stepData, this.router.url);
    this.currentStepData.componentRef = componentRef;
    this.resetCurrentStep();
    this.currentStepData.isCurrent = true;
    this.onStepDataChange();
  }

  /**
   * Calls the current component's wsOnPrevious() or wsOnNext()) methods and navigates to the given
   * step if the component does not abort or its state is invalid (for next navigation).
   *
   * @param stepData The NgWizardStepData of the the step to navigate to
   */
  public navigateToStep(stepData: NgWizardStepData) {
    let goAhead;
    if (this.currentStepData.order > stepData.order) {
      goAhead = this.currentComponent.wsOnPrevious();
    } else {
      goAhead = this.currentComponent.wsIsValid() && this.currentComponent.wsOnNext();
    }
    if (goAhead === false) {
      return;
    }

    let stepPath = stepData.path;
    // If the wizard is added to a specific path in the application we have to join that path and
    // the step's path as the path to navigate to.
    // The Angular Router's relativeTo option does not seem to work when using the hash location
    // strategy.
    if (this.wizardRoute.path) {
      stepPath = [this.wizardRoute.path, stepData.path].join('/');
    }

    if (stepData.options.cleanQueryParameters) {
      return this.router.navigate([stepPath], { queryParams: {} });
    } else {
      return this.router.navigate([stepPath], { queryParamsHandling: 'merge' });
    }
    return this.router.navigate([stepPath], { queryParamsHandling: 'merge' });
  }

  /**
   * Utility method to navigate to the next step.
   */
  public navigateToNextStep() {
    const nextStepData = utils.getStepDataForPath(this.stepData, this.currentStepData.nextStep);
    return this.navigateToStep(nextStepData);
  }

  /**
   * Utility method to navigate to the previous step.
   */
  public navigateToPreviousStep() {
    const previousStepData = utils.getStepDataForPath(this.stepData, this.currentStepData.previousStep);

    return this.navigateToStep(previousStepData);
  }

  /**
   * Returns the step data changes as an observable.
   */
  public getStepDataChangesAsObservable(): Observable<NgWizardStepData[]> {
    return this.stepDataChanges.asObservable();
  }

  /**
   * Returns the current step data as an observable.
   */
  // TODO: Write a unit test for this method
  public getCurrentStepDataAsObservable(): Observable<NgWizardStepData> {
    return this.getStepDataChangesAsObservable().pipe(
      map((stepDatas) => stepDatas.find((stepData) => stepData.isCurrent)),
    );
  }

  /**
   * Returns the Angular Route for the wizard component found in Angular's router config.
   * @param wizardComponentName The name of the wizard component
   */
  private getWizardRoute(wizardComponentName: string): Route {
    return this.router.config.find((route) => route.component && route.component.name === wizardComponentName);
  }

  /**
   * Parses the child routes of the wizard component route and stores them as a list of
   * NgWizardStepData.
   * @param wizardRoute The Angular Route for the wizard component
   */
  private loadChildRoutes(wizardRoute: Route) {
    if (!wizardRoute.children) {
      throw new NoChildRoutes(wizardRoute.component.name, wizardRoute.path);
    }

    const childRoutes = wizardRoute.children.filter((route) => route.component);

    for (let i = 0; i < childRoutes.length; i++) {
      this.registerStep(i, childRoutes[i], childRoutes[i - 1], childRoutes[i + 1]);
    }
  }

  /**
   * Stores a child route as an NgWizardStepData.
   * @param index The index in the list of child routes
   * @param stepRoute The child route
   * @param previousStep The previous child route (undefined if first child route)
   * @param nextStep The next child route (undefined if last child route)
   */
  private registerStep(index: number, stepRoute: Route, previousStep: Route, nextStep: Route) {
    this.stepData.push({
      order: index + 1,
      componentName: stepRoute.component.name,
      path: stepRoute.path,
      previousStep: previousStep ? previousStep.path : undefined,
      nextStep: nextStep ? nextStep.path : undefined,
      isCurrent: false,
      options: utils.getWizardStepOptions(stepRoute),
    });
    this.onStepDataChange();
  }

  /**
   * Emits a step data change event to the subscribers when the step data changes.
   */
  private onStepDataChange() {
    this.stepDataChanges.next(this.stepData);
  }

  /**
   * Sets the isCurrent attribute of all step data to false.
   */
  private resetCurrentStep() {
    this.stepData.map((stepData) => {
      stepData.isCurrent = false;
      return stepData;
    });
  }
}
