import rclpy
from rclpy.node import Node
from rclpy.action import ActionServer
from control_msgs.action import FollowJointTrajectory
from trajectory_msgs.msg import JointTrajectory
from std_msgs.msg import Float64
import time

class UR5ActionServer(Node):
    def __init__(self):
        super().__init__('ur5_action_server')

        # Action Server
        self._action_server = ActionServer(
            self,
            FollowJointTrajectory,
            '/scaled_joint_trajectory_controller/follow_joint_trajectory',
            self.execute_callback
        )

        # Topic Subscriber (Alternative to Action)
        self.traj_sub = self.create_subscription(
            JointTrajectory,
            '/ur5/trajectory',
            self.trajectory_callback,
            10
        )

        # Publishers for Position Controllers
        self.pub_shoulder_pan = self.create_publisher(Float64, '/ur5/shoulder_pan/cmd', 10)
        self.pub_shoulder_lift = self.create_publisher(Float64, '/ur5/shoulder_lift/cmd', 10)
        self.pub_elbow = self.create_publisher(Float64, '/ur5/elbow/cmd', 10)
        self.pub_wrist_1 = self.create_publisher(Float64, '/ur5/wrist_1/cmd', 10)
        self.pub_wrist_2 = self.create_publisher(Float64, '/ur5/wrist_2/cmd', 10)
        self.pub_wrist_3 = self.create_publisher(Float64, '/ur5/wrist_3/cmd', 10)

        self.get_logger().info('UR5 Control Node Started (Action + Topic)')

    def trajectory_callback(self, msg):
        self.get_logger().info('Received Trajectory Message on Topic')
        if not msg.points:
            return

        # Execute the last point
        self.move_to_point(msg.points[-1])

    def execute_callback(self, goal_handle):
        self.get_logger().info('Received Action goal...')
        trajectory_points = goal_handle.request.trajectory.points
        if not trajectory_points:
            goal_handle.succeed()
            return FollowJointTrajectory.Result()

        self.move_to_point(trajectory_points[-1])

        goal_handle.succeed()
        result = FollowJointTrajectory.Result()
        return result

    def move_to_point(self, target_point):
        positions = target_point.positions
        if len(positions) < 6:
            self.get_logger().warn('Invalid joint count')
            return

        # Map positions to publishers [pan, lift, elbow, w1, w2, w3]
        self.publish_pos(self.pub_shoulder_pan, positions[0])
        self.publish_pos(self.pub_shoulder_lift, positions[1])
        self.publish_pos(self.pub_elbow, positions[2])
        self.publish_pos(self.pub_wrist_1, positions[3])
        self.publish_pos(self.pub_wrist_2, positions[4])
        self.publish_pos(self.pub_wrist_3, positions[5])

        self.get_logger().info(f'Moved to: {positions}')

    def publish_pos(self, publisher, value):
        msg = Float64()
        msg.data = float(value)
        publisher.publish(msg)

def main(args=None):
    rclpy.init(args=args)
    action_server = UR5ActionServer()
    rclpy.spin(action_server)

if __name__ == '__main__':
    main()
