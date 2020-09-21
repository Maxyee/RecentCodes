import React from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';
import { Button, Spinner } from 'react-bootstrap';
import { SSMTable, CELL_MIDDLE, ICON_MIDDLE } from '../../../components/styled/TableStyled';
import { Column, SortDirection } from 'react-virtualized';
import { calcDateStringDuration, calcDuration, lastCheckFormatter, tableNoDataRenderer, getTableSize, i18nTextOrDefault, preventUpdateStateAfterUnmount, statusFormatter } from "../../../components/SsmUtils";
import {
  getTasksAPI, getTaskByIdAPI, getArtifactsByTaskIdAPI, getArtifactByUrlAPI,
  FIELD_TASK_STATUS_CODE, FIELD_TASK_ID, FIELD_TASK_TYPE,
  FIELD_TASK_START_TIME, FIELD_TASK_DURATION, FIELD_TASK_HOST_NAME,
  FIELD_TASK_ADDRESS, FIELD_TASK_STAGE, FIELD_TASK_PROGRESS, FIELD_TASK_DONE_TIME
} from '../../../apis/task-api';

import { SsmHeaderRenderer, defaultOnResizeRow, DefaultHeaderRenderer, TABLE_WIDTH, COLUMN_RATIO, IS_DRAGGING } from "../../../components/SsmTableComponents";
import { Progress } from 'react-sweet-progress';
import Moment from 'react-moment';

import {
  TASK_DETAILS_TAB,
} from '../../../constants/action-types/task-actions';
import TaskDetailPage from './TaskDetailPage';
import TaskDetailAreaSdo from './TaskDetailAreaSdo';
import matchSorter from 'match-sorter';
import { Col, Row } from 'react-bootstrap';

const PADDING_WIDTH = 15 * 2;
const DETAIL_MENU_WIDTH = 40;
const COLUMN_MIN_WIDTH = 40;

const columnRatio = {
  [FIELD_TASK_STATUS_CODE]: 0.09,
  [FIELD_TASK_ID]: 0.11,
  [FIELD_TASK_TYPE]: 0.16,
  [FIELD_TASK_START_TIME]: 0.10,
  [FIELD_TASK_DONE_TIME]: 0.10,
  [FIELD_TASK_DURATION]: 0.16,
  [FIELD_TASK_HOST_NAME]: 0.14,
  [FIELD_TASK_ADDRESS]: 0.12,
  [FIELD_TASK_STAGE]: 0.12,
  [FIELD_TASK_PROGRESS]: 0.12,
};


class ViewDetailTask extends React.Component {

  constructor(props) {
    super(props);

    this.state = {
      viewDetails: [],
      hasStage: false,
      tableHeight: 400,
      [TABLE_WIDTH]: 512,
      [COLUMN_RATIO]: columnRatio,
      [IS_DRAGGING]: false,

      taskStatus: {},
      taskStatusList: null,
      taskID: this.props.task.taskID,

    };

    this.handleResizeRow = defaultOnResizeRow(this, TABLE_WIDTH, COLUMN_RATIO, IS_DRAGGING, COLUMN_MIN_WIDTH);
    this.headerRenderer = SsmHeaderRenderer(this.handleResizeRow);
    this.updateTableSize = this.updateTableSize.bind(this);

    this.task_info = this.task_info.bind(this);
    this.console_output = this.console_output.bind(this);
    this.status_list = this.status_list.bind(this);
  }


  componentDidMount() {

    let selectedTask = this.props.task.selectedTasksDetail
    console.log(selectedTask)

    this.setState((state, props) => {
      return {
        ...state,
        viewDetails: selectedTask
      }
    })

    selectedTask.forEach(elem => {
      console.log(elem.stage)
      if (elem.stage !== undefined) {
        this.setState((state) => {
          return {
            ...state,
            hasStage: true,
            taskID: elem.taskID,
            taskName: elem.taskName
          }
        })
        this.props.getTaskData(elem.taskID).then(data => {
          this.setState((state, props) => {
            console.log(data);
            return {
              ...state,
              taskStatus: data,
              taskStatusList: data,
            }
          });

        });
      }
      else {
        this.setState((state) => {
          return {
            ...state,
            hasStage: false,
            taskID: elem.taskID,
            taskName: elem.taskName
          }
        })
        this.props.getTaskData(elem.taskID).then(data => {
          this.setState((state, props) => {
            console.log(data);
            return {
              ...state,
              taskStatus: data,
              taskStatusList: data,
            }
          });

        });
      }
    })

    this.updateTableSize();
    window.addEventListener('resize', this.updateTableSize);

  }

  updateTableSize() {
    const size = getTableSize();

    const height = size.height - 5;
    const width = size.width - PADDING_WIDTH;
    if (height !== this.state.tableHeight || width !== this.state.tableWidth)
      this.setState((state, props) => {
        return {
          ...state,
          tableHeight: height / 8,
          tableWidth: width
        }
      });
  }

  progressFormatter = ({ cellData }) => {
    if (cellData !== undefined) {
      const value = cellData.percentage;
      return (
        <div className="task-progress-column">
          <Progress percent={value} />
        </div>
      );
    }
    return null;
  };

  statusFormatter = ({ cellData }) => {
    const value = cellData;
    //Util functions
    function makeTitleCase(str) {
      return _.startCase(_.toLower(str));
    }

    if (_.toUpper(value) === 'RUNNING') {
      return (
        <div className="task-status-column">
          <Spinner animation="border" size="sm" />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </div>
      );
    } else if (_.toUpper(value) === 'FAILED') {
      return (
        <div className="task-status-column">
          <i className="fas fa-times-circle" style={{ color: 'red' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </div>
      );
    } else if (_.toUpper(value) === 'PENDING') {
      return (
        <div className="task-status-column">
          <i className="fas fa-exclamation-triangle" style={{ color: 'orange' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </div>
      );
    } else if (_.toUpper(value) === 'FINISHED') {
      return (
        <div className="task-status-column">
          <i className="fas fa-check-circle" style={{ color: 'limeGreen' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </div>
      );
    }

    return (
      <div>
        <i classNmae="fas fa-spinner" />
      </div>
    );
  };

  stageFormatter = ({ cellData }) => {
    let greyFont = <i className="fas fa-grip-horizontal" style={{ color: 'grey', marginRight: '5px' }}></i>
    let greenFont = <i className="fas fa-grip-horizontal" style={{ color: 'green', marginRight: '5px' }}></i>
    let font = [];
    let limit = 4;
    let difference = limit - cellData;
    if (cellData !== undefined) {
      for (var i = 0; i < cellData; i++) {
        font.push(greenFont);
      }
      for (var d = 0; d < difference; d++) {
        font.push(greyFont);
      }
      return (
        <div className="task-stage-column">
          {font}
        </div>)
    }
    return null;

  }

  //------------------------------- console output -------------------------------

  console_output() {
    let consoleOutput = [];

    consoleOutput.push(
      <div style={{ maxHeight: "40rem" }}>
        <pre>
          {this.state.taskStatus.message}
        </pre>
      </div>

    );

    return consoleOutput;
  }

  //---------------------------- task info --------------------------------------

  detailsStartTimeFormatter(value) {
    return (
      <Moment interval={0} tz="Asia/Hong_Kong" format="YYYY/MM/DD HH:mm:ss">
        {value}
      </Moment>
    );
  }

  detailsStatusFormatter(value) {
    //Util functions
    function makeTitleCase(str) {
      return _.startCase(_.toLower(str));
    }

    if (_.toUpper(value) === 'RUNNING') {
      return (
        <span>
          <i className="fas fa-spinner" />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </span>
      );
    } else if (_.toUpper(value) === 'FAILED') {
      return (
        <span>
          <i className="fas fa-times-circle" style={{ color: 'red' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </span>
      );
    } else if (_.toUpper(value) === 'PENDING') {
      return (
        <span>
          <i className="fas fa-exclamation-triangle" style={{ color: 'orange' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </span>
      );
    } else if (_.toUpper(value) === 'FINISHED') {
      return (
        <span>
          <i className="fas fa-check-circle" style={{ color: 'limeGreen' }} />
          &nbsp;&nbsp;{makeTitleCase(value)}
        </span>
      );
    }
    return '';
  }

  task_info() {
    let taskInfo = [];
    taskInfo.push(
      <tbody key={Math.floor(Math.random() * 100001)}>
        <tr key={Math.floor(Math.random() * 100001)}>
          <td className="label bold">Task ID</td>
          <td>{this.state.taskStatus.taskId}</td>
        </tr>
        <tr key={Math.floor(Math.random() * 100001)}>
          <td className="label bold">Task Name</td>
          <td>{this.state.taskStatus.taskName}</td>
        </tr>
        <tr key={Math.floor(Math.random() * 100001)}>
          <td className="label bold">Start Time</td>
          <td>{this.state.taskStatus.startTime}</td>
        </tr>
        <tr key={Math.floor(Math.random() * 100001)}>
          <td className="label bold">Duration</td>
          <td>{calcDateStringDuration(this.state.taskStatus.startTime, this.state.taskStatus.doneTime)}</td>
        </tr>
        <tr key={Math.floor(Math.random() * 100001)}>
          <td className="label bold">Task Status</td>
          <td>{this.detailsStatusFormatter(this.state.taskStatus.status)}</td>
        </tr>
        {this.state.taskStatus.metadata === undefined ?
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Host Name</td>
            <td>NO hostname</td>
          </tr>
          ) :
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Host Name</td>
            <td>{this.state.taskStatus.metadata.hostName}</td>
          </tr>
          )}

        {this.state.taskStatus.metadata === undefined ?
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Source</td>
            <td>No source</td>
          </tr>
          ) :
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Source</td>
            <td>{this.state.taskStatus.metadata.source}</td>
          </tr>
          )}

        {this.state.taskStatus.metadata === undefined ?
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Submitted By</td>
            <td>No Owner</td>
          </tr>
          ) :
          (<tr key={Math.floor(Math.random() * 100001)}>
            <td className="label bold">Submitted By</td>
            <td>{this.state.taskStatus.metadata.user}</td>
          </tr>
          )}
      </tbody>
    );

    return taskInfo;
  }

  //-------------------------------task status list------------------------------
  elapsedTimeFormatter(message, duration) {
    let arrElapsed = Array();
    if (message !== undefined) {
      message = message.split('\n');
      for (let i = 5; i + 4 <= message.length; i++) {
        let elem = message[i].split('|');
        arrElapsed.push(elem[3]);
      }

      if (duration !== undefined && duration !== null) {
        if (arrElapsed.length === 0) {
          let elapseTime = duration
            .slice(4)
            .replace('h ', ':')
            .replace('m ', ':')
            .replace('s', '');
          arrElapsed.push(elapseTime);
        }
      } else if (arrElapsed.length === 0) {
        arrElapsed.push('');
      }
    }
    return arrElapsed;
  }

  hostStatusDataExtract(message) {
    let arrHostStatusData = Array();

    if (message !== undefined) {
      message = message.split('\n');
      for (let i = 5; i + 4 <= message.length; i++) {
        let obj = {};
        let elem = message[i].split('|');
        obj = {
          status: _.trim(elem[4]),
          exitCode: _.trim(elem[5]),
        };
        arrHostStatusData.push(obj);
      }
    }
    return arrHostStatusData;
  }

  status_list() {
    let statusList = [];

    let listData = this.state.taskStatusList
      ? this.state.taskStatusList
      : null;
    let detailsData = this.state.taskStatusList
      ? this.state.taskStatusList
      : null;

    let elapsedTime =
      detailsData !== undefined && detailsData !== null
        ? this.elapsedTimeFormatter(detailsData.message, listData.duration)
        : null;
    let hostStatusData =
      detailsData !== undefined && detailsData !== null
        ? this.hostStatusDataExtract(detailsData.message)
        : null;

    statusList.push(
      <tr key={'statusList_header'}>
        <td className="bold">Host Name</td>
        <td className="bold">BMC Address</td>
        <td className="bold">Elapsed</td>
        <td className="bold">Status</td>
        <td className="bold">Exit Code</td>
        <td className="bold">Artifact</td>
      </tr>
    );

    if (detailsData !== undefined && detailsData !== null) {
      let hostName = '';
      let bmcList = [];

      console.log(detailsData);

      let hostNameField = 'hostName';

      let hosts = detailsData.metadata.selectedHosts;
      if (hosts != undefined) {
        for (let i = 0; i < hosts.length; i++) {
          let host_bmc_map = {
            hostAddress: hosts[i].address,
            bmcAddress: hosts[i].ipmiAddress,
          };
          bmcList.push(host_bmc_map);
          hostName += hosts[i][hostNameField];
          hostName += i + 1 < hosts.length ? ', ' : '';
        }
      }

      _.map(detailsData.metadata.selectedHosts, (elem, index) => {
        let result = new Array(0);
        if (
          detailsData.metadata.command !== 'Secure Erase' &&
          listData.status !== 'RUNNING' &&
          bmcList[index] !== undefined &&
          detailsData.artifacts !== undefined &&
          detailsData.artifacts !== ''
          && detailsData.artifacts.data.length > 0
        ) {
          result = matchSorter(
            detailsData.artifacts.data,
            bmcList[index].bmcAddress,
            { threshold: matchSorter.rankings.CONTAINS }
          );
        }
        let hostName = elem[hostNameField];
        statusList.push(
          <tr key={Math.floor(Math.random() * 100001)}>
            <td>{hostName}</td>
            <td>
              {bmcList[index] !== undefined ? bmcList[index].bmcAddress : null}
            </td>
            <td>{elapsedTime[index]}</td>
            <td>
              {hostStatusData[index] !== undefined
                ? hostStatusData[index].status
                : detailsData.status}
            </td>
            <td>
              {hostStatusData[index] !== undefined
                ? hostStatusData[index].exitCode
                : 'N/A'}
            </td>
            <td>
              {detailsData.metadata.command !== 'Secure Erase' &&
                listData.status !== 'RUNNING' &&
                result.length > 0 ? (
                  <a
                    className="artifact-link"
                  >
                    View File
                  </a>
                ) : (
                  'N/A'
                )}
            </td>
          </tr>
        );
        // };
      });
    }

    return statusList;
  }

  //------------------------------------------------------------------------------------


  render() {
    const headerHeight = 30;
    const rowHeight = 30;
    const disableHeader = false;
    const overscanRowCount = 10;
    const rowCount = this.state.viewDetails.length;
    console.log(rowCount)
    const rowGetter = ({ index }) => this.state.viewDetails[index];

    const widthWithoutDetail = this.state[TABLE_WIDTH] - DETAIL_MENU_WIDTH;
    const widthMap = {};
    Object.keys(this.state[COLUMN_RATIO]).forEach((key) => {
      widthMap[key] = this.state[COLUMN_RATIO][key] * widthWithoutDetail;
    });

    const { t } = this.props;

    return (
      <div>
        <div
          style={{ marginTop: '30px' }}
        >
          <a href="#/monitoring/tasks"><i class="fa fa-caret-left" aria-hidden="true"></i> Return to Tasks</a>
        </div>

        <h3 style={{fontWeight:''}}>Task Details</h3>
        <div>
          <table>
            {this.props.task.selectedTasksDetail ?
              (
                <tr>
                  <td>Task Name</td>
                  {this.props.task.selectedTasksDetail.map(p =>
                    <td
                      style={{ paddingLeft: '54px' }}
                    >
                      {p.taskName}{" "}{p.taskID}
                    </td>

                  )}

                </tr>
              )
              :
              (
                <tr>
                  <td>Task Name</td>
                  <td
                    style={{ paddingLeft: '54px' }}
                  >
                    No Value
                </td>
                </tr>
              )
            }
            {this.props.task.selectedTasksDetail ?
              (
                <tr>
                  <td>Task Type</td>
                  {this.props.task.selectedTasksDetail.map(p =>
                    <td
                      style={{ paddingLeft: '54px' }}
                    >
                      {p.taskName}
                    </td>

                  )}

                </tr>
              )
              :
              (
                <tr>
                  <td>Task Type</td>
                  <td
                    style={{ paddingLeft: '54px' }}
                  >
                    No Value
                </td>
                </tr>
              )
            }

            {this.props.task.selectedTasksDetail ?
              (
                <tr>
                  <td>Description</td>
                  {this.props.task.selectedTasksDetail.map(p =>
                    <td
                      style={{ paddingLeft: '54px' }}
                    >
                      {p.taskName}{" "}{p.taskID}
                    </td>

                  )}

                </tr>
              )
              :
              (
                <tr>
                  <td>Description</td>
                  <td
                    style={{ paddingLeft: '54px' }}
                  >
                    No Value
                </td>
                </tr>
              )
            }

            {this.props.task.selectedTasksDetail ?
              (
                <tr>
                  <td>Status</td>
                  {this.props.task.selectedTasksDetail.map(p =>
                    <td
                      style={{ paddingLeft: '54px' }}
                    >
                      {p.status}
                    </td>

                  )}

                </tr>
              )
              :
              (
                <tr>
                  <td>Status</td>
                  <td
                    style={{ paddingLeft: '54px' }}
                  >
                    No Value
                </td>
                </tr>
              )
            }

            {this.props.task.selectedTasksDetail ?
              (
                <tr>
                  <td>Submitted By</td>
                  {this.props.task.selectedTasksDetail.map(p =>

                    (() => {
                      if (p.metadata === undefined) {
                        return <td style={{ paddingLeft: '54px' }}>No Value</td>
                      }
                      else {
                        return <td style={{ paddingLeft: '54px' }}>{p.metadata.user}</td>
                      }
                    })()
                  )}

                </tr>
              )
              :
              (
                <tr>
                  <td>Submitted By</td>
                  <td
                    style={{ paddingLeft: '54px' }}
                  >
                    No Value
                </td>
                </tr>
              )
            }
          </table>
        </div>


        <div style={{ marginTop: '5px' }}>
          <i className="fas fa-redo" style={{ cursor: 'pointer' }}></i>
        </div>


        <div style={{ marginTop: '15px' }}>
          <h3 style={{ fontWeight: 'bold' }}>Task Execution History</h3>
          <hr />
          <i className="fas fa-download" style={{ cursor: 'pointer' }}></i>
        </div>

        <div style={{ marginTop: '10px' }}>
          <SSMTable
            disableHeader={disableHeader}
            headerHeight={headerHeight}
            height={this.state.tableHeight}
            noRowsRenderer={this.handleNoDataRenderer}
            overscanRowCount={overscanRowCount}
            rowHeight={rowHeight}
            rowGetter={rowGetter}
            rowCount={rowCount}
            onRowClick={this.handleRowClick}
            rowStyle={this.rowStyleFormat}
            sort={this.handleSort}
            sortBy={this.state.sortBy}
            sortDirection={this.state.sortDirection}
            width={this.state[TABLE_WIDTH]}
            containerStyle={{ overflow: "visible" }}
          >
            <Column
              label={i18nTextOrDefault(t, "general.taskStatus", "Task Status")}
              cellDataGetter={({ rowData }) => rowData[FIELD_TASK_STATUS_CODE]}
              cellRenderer={this.statusFormatter}
              dataKey={FIELD_TASK_STATUS_CODE}
              width={widthMap[FIELD_TASK_STATUS_CODE]}
              headerRenderer={this.headerRenderer}
              minWidth={COLUMN_MIN_WIDTH}
            />
            <Column
              label={i18nTextOrDefault(t, "general.startTime", "Start Time")}
              dataKey={FIELD_TASK_START_TIME}
              width={widthMap[FIELD_TASK_START_TIME]}
              headerRenderer={this.headerRenderer}
              className={ICON_MIDDLE}
              minWidth={COLUMN_MIN_WIDTH}
            />
            <Column
              label={i18nTextOrDefault(t, "general.doneTime", "Done Time")}
              dataKey={FIELD_TASK_DONE_TIME}
              width={widthMap[FIELD_TASK_DONE_TIME]}
              headerRenderer={this.headerRenderer}
              className={ICON_MIDDLE}
              minWidth={COLUMN_MIN_WIDTH}
            />
            <Column
              label={i18nTextOrDefault(t, "general.duration", "Duration")}
              cellDataGetter={({ rowData }) => rowData[FIELD_TASK_DURATION]}
              cellRenderer={this.calcDuration}
              dataKey={FIELD_TASK_DURATION}
              width={widthMap[FIELD_TASK_DURATION]}
              headerRenderer={this.headerRenderer}
              className={ICON_MIDDLE}
              minWidth={COLUMN_MIN_WIDTH}
            />
            {this.state.hasStage ?
              (<Column
                label={i18nTextOrDefault(t, "general.stage", "Stage")}
                cellDataGetter={({ rowData }) => rowData[FIELD_TASK_STAGE]}
                cellRenderer={this.stageFormatter}
                dataKey={FIELD_TASK_STAGE}
                width={widthMap[FIELD_TASK_STAGE]}
                headerRenderer={DefaultHeaderRenderer}
                className={CELL_MIDDLE}
                minWidth={COLUMN_MIN_WIDTH}
              />)
              :
              (<Column
                label={i18nTextOrDefault(t, "general.taskProgress", "Task Progress")}
                cellDataGetter={({ rowData }) => rowData[FIELD_TASK_PROGRESS]}
                cellRenderer={this.progressFormatter}
                dataKey={FIELD_TASK_PROGRESS}
                width={widthMap[FIELD_TASK_PROGRESS]}
                headerRenderer={DefaultHeaderRenderer}
                className={CELL_MIDDLE}
                minWidth={COLUMN_MIN_WIDTH}
              />)
            }
          </SSMTable>
        </div>

        <div>
          {this.state.taskName === 'SDO' ?
            (<TaskDetailAreaSdo
              onShowTab={this.props.taskDetailsActiveTab}
              showTab={this.props.task.taskDetailsTab}
              diagnosticSummary={this.task_info()}
              downloadResult={this.console_output()}
              viewReport={this.status_list()}
            ></TaskDetailAreaSdo>)
            :
            (<TaskDetailPage
              onShowTab={this.props.taskDetailsActiveTab}
              showTab={this.props.task.taskDetailsTab}
              taskInfo={this.task_info()}
              consoleOutput={this.console_output()}
              statusList={this.status_list()}
            ></TaskDetailPage>)
          }
        </div>

      </div>
    )
  }
}


const mapStateToProps = (state) => {
  return {
    task: state.taskReducer,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    getTaskData: (taskID) => {
      return getTaskByIdAPI(dispatch, taskID);
    },
    taskDetailsActiveTab: (taskDetailsTab) => {
      dispatch({
        type: TASK_DETAILS_TAB,
        payload: {
          taskDetailsTab,
        },
      });
    },
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ViewDetailTask);
